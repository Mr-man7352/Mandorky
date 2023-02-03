#!/usr/bin/env node

const glob = require('glob');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');
const { EOL } = require('os');
var AWS = require('aws-sdk');
const { exit } = require('process');


// Initializes project, creates a new .dorky folder, and adds a metadata file to it, and creates a .dorkyignore file.
function initializeProject() {
    if (fs.existsSync('.dorky')) {
        console.log('Dorky project already initialized. Remove .dorky folder to reinitialize.')
    } else {
        fs.mkdirSync('.dorky');
        fs.writeFileSync('.dorky/metadata.json', JSON.stringify({ 'stage-1-files': [], 'uploaded-files': [] }));
        if (fs.existsSync('.dorkyignore')) {
            fs.rmSync('.dorky',{
                recursive:true
            });
            console.log('Dorky project already initialized. Remove .dorkyignore file to reinitialize.');
        } else {
            fs.writeFileSync('.dorkyignore', '');
            console.log('Initialized project in current folder(.dorky).');
        }
    }
}

// Lists all the files that are not excluded explicitly.
function listFiles() {
    let exclusions = fs.readFileSync('./.dorkyignore').toString().split(EOL);
    exclusions = exclusions.filter((exclusion) => exclusion !== '');
    if (exclusions[0] == '') exclusions = [];
    var getDirectories = function (src, callback) {
        glob(src + '/**/*', callback);
    };

    function excludeIsPresent(element) {
        let present = false;
        let i = 0;
        while (i < exclusions.length) {
            if (element.includes(exclusions[i])) present = true;
            i += 1;
        }
        return present;
    }
    getDirectories(process.cwd(), function (err, res) {
        if (err) {
            console.log('Error', err);
        } else {
            let listOfFiles;
            listOfFiles = res.filter(element => !excludeIsPresent(element)).map(file => path.relative(process.cwd(), file));
            console.log(chalk.green('Found files:'))
            listOfFiles.map((file) => console.log('\t' + chalk.bgGrey(file)));
        }
    });
}

if (process.env.BUCKET_NAME && process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY && process.env.AWS_REGION) {
    AWS.config.update({
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
        region: process.env.AWS_REGION
    });
} else {
    console.log('Set BUCKET_NAME, AWS_ACCESS_KEY, AWS_SECRET_KEY and AWS_REGION first.')
    exit();
}

const args = process.argv.splice(2, 2);

if (args.length == 0) {
    const helpMessage = `Help message:-\n\ninit\t\t\t Initializes a dorky project.\nlist\t\t\t Lists files in current root directory.\npush\t\t\t Pushes changes to S3 bucket.\npull\t\t\t Pulls changes from S3 bucket to local root folder.\nadd <filename>\t\t Add file to stage-1.\nreset <filename>\t remove file from stage-1.\n`
    console.log(helpMessage);
} else if (args.length == 1) {
    if (args[0] == 'init') {
        initializeProject();
    }
    if (args[0] == 'list') {
        listFiles();
    }
    if (args[0] == 'push') {
        console.log('Pushing files to server.');
        let rootFolder;
        if (process.cwd().includes('\\')) {
            rootFolder = process.cwd().split('\\').pop()
        } else if (process.cwd().includes('/')) {
            rootFolder = process.cwd().split('/').pop()
        } else rootFolder = process.cwd()
        console.log(rootFolder)
        function rootFolderExists(rootFolder) {
            let s3 = new AWS.S3();
            const bucketParams = { Bucket: process.env.BUCKET_NAME };
            s3.listObjects(bucketParams, (err, s3Objects) => {
                if (err) console.log(err);
                else {
                    if (s3Objects.Contents.filter((object) => object.Key.split('/')[0] == rootFolder).length > 0) {
                        let metaData = JSON.parse(fs.readFileSync(path.join('.dorky', 'metadata.json')).toString());
                        // Get removed files
                        let removed = metaData['uploaded-files'].filter(x => !metaData['stage-1-files'].includes(x));
                        // Uploaded added files.
                        let added = metaData['stage-1-files'].filter(x => !metaData['uploaded-files'].includes(x));

                        added.map((file) => {
                            if (metaData['uploaded-files'].includes(file)) return;
                            else {
                                const putObjectParams = {
                                    Bucket: process.env.BUCKET_NAME,
                                    Key: path.join(rootFolder, path.relative(process.cwd(), file)).split('\\').join('/'),
                                    Body: fs.readFileSync(path.relative(process.cwd(), file)).toString()
                                }
                                // Upload records
                                s3.putObject(putObjectParams, (err, data) => {
                                    if (err) {
                                        console.log('Unable to upload file ' + path.join(rootFolder, path.relative(process.cwd(), file)).replace(/\\/g, '/'))
                                        console.log(err);
                                    }
                                    else console.log(chalk.green('Uploaded ' + file));
                                });
                                metaData['uploaded-files'].push(file);
                            }
                        });

                        if (removed.length) {
                            const removedObjectParams = {
                                Bucket: process.env.BUCKET_NAME,
                                Delete: {
                                    Objects: removed.map((file) => {
                                        return { Key: file };
                                    }),
                                    Quiet: true
                                }
                            }
                            // Delete removed records, doesn't delete immediately.
                            s3.deleteObjects(removedObjectParams, (err, data) => {
                                if (err) console.log(err.stack);
                                else console.log('Deleted removed files.');
                            });
                        }
                        if (metaData['uploaded-files'] != metaData['stage-1-files']) {
                            metaData['uploaded-files'] = Array.from(new Set(metaData['stage-1-files']));
                            fs.writeFileSync(path.join('.dorky', 'metadata.json'), JSON.stringify(metaData));
                            putObjectParams = {
                                Bucket: process.env.BUCKET_NAME,
                                Key: path.relative(process.cwd(), path.join(rootFolder.toString(), 'metadata.json')).replace(/\\/g, '/'),
                                Body: JSON.stringify(metaData)
                            }
                            // Upload metadata.json
                            s3.putObject(putObjectParams, (err, data) => {
                                if (err) console.log(err);
                                else console.log(chalk.green('Uploaded metadata'));
                            });
                        } else {
                            console.log('Nothing to push');
                        }

                    } else {

                        let metaData = JSON.parse(fs.readFileSync(path.join('.dorky', 'metadata.json')).toString());
                        metaData['stage-1-files'].map((file) => {
                            if (metaData['uploaded-files'].includes(file)) return;
                            else {
                                const putObjectParams = {
                                    Bucket: process.env.BUCKET_NAME,
                                    Key: path.join(rootFolder, path.relative(process.cwd(), file)).replace(/\\/g, '/'),
                                    Body: fs.readFileSync(path.relative(process.cwd(), file)).toString()
                                }
                                // Upload records
                                s3.putObject(putObjectParams, (err, data) => {
                                    if (err) {
                                        console.log('Unable to upload file ' + path.join(rootFolder, path.relative(process.cwd(), file)).replace(/\\/g, '/'))
                                        console.log(err);
                                    }
                                    else console.log(chalk.green('Uploaded ' + file));
                                });
                                metaData['uploaded-files'].push(file);
                            }
                        });
                        metaData['uploaded-files'] = Array.from(new Set(metaData['uploaded-files']));
                        fs.writeFileSync(path.join('.dorky', 'metadata.json'), JSON.stringify(metaData));
                        putObjectParams = {
                            Bucket: process.env.BUCKET_NAME,
                            Key: path.relative(process.cwd(), path.join(rootFolder.toString(), 'metadata.json')).replace(/\\/g, '/'),
                            Body: JSON.stringify(metaData)
                        }
                        // Upload metadata.json
                        s3.putObject(putObjectParams, (err, data) => {
                            if (err) console.log(err);
                            else console.log(chalk.green('Uploaded metadata'));
                        });
                    }
                }
            })

        }
        rootFolderExists(rootFolder);
    }
    if (args[0] == 'help') {
        const helpMessage = `Help message:-\n\ninit\t\t\t Initializes a dorky project.\nlist\t\t\t Lists files in current root directory.\npush\t\t\t Pushes changes to S3 bucket.\npull\t\t\t Pulls changes from S3 bucket to local root folder.\nadd <filename>\t\t Add file to stage-1.\nreset <filename>\t remove file from stage-1.\n`
        console.log(helpMessage);
    }
    if (args[0] == 'pull') {
        console.log('Pulling files from server.')
        let rootFolder;
        if (process.cwd().includes('\\')) {
            rootFolder = process.cwd().split('\\').pop()
        } else if (process.cwd().includes('/')) {
            rootFolder = process.cwd().split('/').pop()
        } else rootFolder = process.cwd()
        let s3 = new AWS.S3();
        const bucketParams = { Bucket: process.env.BUCKET_NAME };
        s3.listObjects(bucketParams, (err, s3Objects) => {
            if (err) console.log(err);
            else {
                if (s3Objects.Contents.filter((object) => object.Key.split('/')[0] == rootFolder).length > 0) {
                    if (s3Objects.Contents.filter((object) => object.Key == (rootFolder + '/metadata.json')).length > 0) {
                        const params = {
                            Bucket: process.env.BUCKET_NAME,
                            Key: rootFolder + '/metadata.json'
                        }
                        s3.getObject(params, (err, data) => {
                            if (err) console.error(err);
                            else {
                                let metaData = JSON.parse(data.Body.toString());
                                // Pull metadata.json
                                const METADATA_FILE = '.dorky/metadata.json';
                                fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
                                let pullFileParams;
                                metaData['uploaded-files'].map((file) => {
                                    pullFileParams = {
                                        Bucket: process.env.BUCKET_NAME,
                                        Key: rootFolder + '/' + file
                                    }
                                    console.log(pullFileParams)
                                    s3.getObject(pullFileParams, (err, data) => {
                                        if (err) console.log(err);
                                        else {
                                            console.log('Creating file ' + file);
                                            let fileData = data.Body.toString();
                                            let subDirectories;
                                            if (process.cwd().includes('\\')) {
                                                subDirectories = path.relative(process.cwd(), file).split('\\');
                                            } else if (process.cwd().includes('/')) {
                                                subDirectories = path.relative(process.cwd(), file).split('/');
                                            } else subDirectories = path.relative(process.cwd(), file)
                                            subDirectories.pop()
                                            if (process.platform === "win32") {
                                                subDirectories = subDirectories.join('\\')
                                            } else if (process.platform === "linux" || process.platform === "darwin") {
                                                subDirectories = subDirectories.join('/');
                                            }
                                            if (subDirectories.length) fs.mkdirSync(subDirectories, { recursive: true });
                                            fs.writeFileSync(path.relative(process.cwd(), file), fileData);
                                        }
                                    })
                                });
                            }
                        });
                    } else {
                        console.log('Metadata doesn\'t exist')
                    }
                } else {
                    console.error(chalk.red('Failed to pull folder, as it doesn\'t exist'));
                }
            }
        });
    }
} else if (args.length == 2) {
    if (args[0] == 'add') {
        const METADATA_FILE = '.dorky/metadata.json';
        const file = args[1];
        if (fs.existsSync(file)) {
            const metaData = JSON.parse(fs.readFileSync(METADATA_FILE));
            const stage1Files = new Set(metaData['stage-1-files']);
            stage1Files.add(file);
            metaData['stage-1-files'] = Array.from(stage1Files);
            fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
            console.log(chalk.bgGreen('Success'));
            console.log(chalk.green(`Added file ${file} successfully to stage-1.`))
        } else {
            console.log(chalk
                .bgRed('Error'))
            console.log(chalk.red(`\tFile ${file} doesn\'t exist`))
        }
    } else if (args[0] == 'reset') {
        const METADATA_FILE = '.dorky/metadata.json';
        const metaData = JSON.parse(fs.readFileSync(METADATA_FILE));
        const file = args[1];
        resetFileIndex = metaData['stage-1-files'].indexOf(file);
        metaData['stage-1-files'].splice(resetFileIndex, 1);
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metaData));
    }
}
