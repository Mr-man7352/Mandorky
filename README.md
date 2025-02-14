# dorky
DevOps Records Keeper

## Steps to use:

> Setup AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION before hand.

> Create a S3 bucket with the name `dorky` before start.

### To push files to S3 bucket.
In your Terminal, set these variables
```
export BUCKET_NAME=dorky-bucketName 
export AWS_ACCESS_KEY=AWSAccessKey   
export AWS_SECRET_KEY=AWSSecretKey
export AWS_REGION=AWSRegion 
```
1. Initialize dorky setup in the root folder of your project, using `dorky init`.
2. List the files using `dorky list`, (make sure to add excluded file or folder patterns to .dorkyignore, to minimize the list).
3. Add files to stage-1 using `dorky add file-name`.
4. Push files to S3 bucket using `dorky push`.

### To remove a file from project.
1. Remove files using `dorky reset file-name`.
2. Push files to S3 bucket using `dorky push`.

### To pull files from S3 bucket.
1. Initialize dorky project using `dorky init`.
2. Use `dorky pull` to pull the files from S3 bucket.
