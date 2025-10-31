# Assignment 2 - Cloud Services Exercises - Response to Criteria

## Instructions

- Keep this file named A2_response_to_criteria.md, do not change the name
- Upload this file along with your code in the root directory of your project
- Upload this file in the current Markdown format (.md extension)
- Do not delete or rearrange sections. If you did not attempt a criterion, leave it blank
- Text inside [ ] like [eg. S3 ] are examples and should be removed

## Overview

- **Name:** Hossein Ali Rahimi
- **Student number:** n11030453
- **Partner name (if applicable):** NO PARTNER
- **Application name:** Video-transcoder
- **Two line description:** A cloud-based video transcoding application where users can upload videos directly to S3, monitor processing, and download transcoded versions. Authentication and permissions are managed via Cognito, and metadata is stored in DynamoDB. Audit logs are persisted in RDS (MySQL).
- **EC2 instance name or ID:**

---

### Core - First data persistence service

- **AWS service name:** Amazon S3
- **What data is being stored?:** Raw uploaded video files and transcoded output video files.
- **Why is this service suited to this data?:** S3 is designed for large binary objects, durable storage, and direct client uploads/downloads. It scales easily for high-volume video files.
- **Why is are the other services used not suitable for this data?:** ----DynamoDB is optimised for structured metadata, not large binary objects.
  ----RDS is optimised for relational structured data, not storing gigabytes of video.
- **Bucket/instance/table name:** video-transcoder-n11030453
- **Video timestamp:** 00:00--01:09
- ## **Relevant files:** index.js,storage.js, app.js, transcoder.html

### Core - Second data persistence service

- **AWS service name:** Amazon DynamoDB
- **What data is being stored?:** Video metadata: video ID, owner (username), rawKey, processedKey, status (PENDING, PROCESSING, COMPLETED), timestamps.
- **Why is this service suited to this data?:** DynamoDB is excellent for high-speed lookups of metadata, scalable key–value access, and simple partitioning by user ID.
- **Why is are the other services used not suitable for this data?:**
  ---- S3 is not suitable for structured queries on video metadata.
  ---- RDS would work but is less efficient for high-velocity simple lookups of metadata by key.
- **Bucket/instance/table name:** video-transcoder-n11030453
- **Video timestamp:** 01:10--02:13
- ## **Relevant files:** db.js, index.js, app.js

### Third data service

- **AWS service name:** [eg. RDS]
- **What data is being stored?:** [eg video metadata]
- **Why is this service suited to this data?:** [eg. ]
- **Why is are the other services used not suitable for this data?:** [eg. Advanced video search requires complex querries which are not available on S3 and inefficient on DynamoDB]
- **Bucket/instance/table name:**
- **Video timestamp:**
- ## **Relevant files:**

### S3 Pre-signed URLs

- **S3 Bucket names:** video-transcoder-n11030453
- **Video timestamp:** 01:10--02:13
- ## **Relevant files:** index.js, (/vidoes/upload-url,/videos/:id/download),app.js

### In-memory cache

- **ElastiCache instance name:**
- **What data is being cached?:**
- **Why is this data likely to be accessed frequently?:**
- **Video timestamp:**
- ## **Relevant files:** cache.js, index.js

### Core - Statelessness

- **What data is stored within your application that is not stored in cloud data services?:** Temporary transcoding files written to /tmp inside the container during ffmpeg processing.
- **Why is this data not considered persistent state?:** These intermediate files can always be recreated by downloading the raw video from S3 and running ffmpeg again.
- **How does your application ensure data consistency if the app suddenly stops?:** Status is updated in DynamoDB. On restart, the app reads video states from DynamoDB. Incomplete transcodes remain in PROCESSING or FAILED state and can be retried.
- ## **Relevant files:** index.js

### Graceful handling of persistent connections

- **Type of persistent connection and use:**
- **Method for handling lost connections:**
- ## **Relevant files:** index.js, event.js, app.js

### Core - Authentication with Cognito

- **User pool name:** User pool - wgcpxt
- **How are authentication tokens handled by the client?:** After login, the app stores the Cognito id_token in localStorage and sends it in the Authorization: Bearer header for API calls.
- **Video timestamp:** 02:59---04:50
- ## **Relevant files:** auth.js, index.js, login.html, app.js

### Cognito multi-factor authentication

- **What factors are used for authentication:** SMS + email code (confirmation code sent to email).
- **Video timestamp:**
- ## **Relevant files:** auth.js, index.js, register.html, login.html

### Cognito federated identities

- **Identity providers used:**
- **Video timestamp:**
- ## **Relevant files:**

### Cognito groups

- **How are groups used to set permissions?:** [eg. 'admin' users can delete and ban other users]
- **Video timestamp:**
- ## **Relevant files:**

### Core - DNS with Route53

- **Subdomain**: video-transcoder.cab432.com
- **Video timestamp:** 05:04---05:48

### Parameter store

- **Parameter names:** /video-app/API_BASE_URL, /video-app/TRANSCODE_PRESET
- **Video timestamp:**
- ## **Relevant files:** index.js, transcodeVidoe

### Secrets manager

- **Secrets names:** [eg. n1234567-youtube-api-key]
- **Video timestamp:**
- ## **Relevant files:**

### Infrastructure as code

- **Technology used:**
- **Services deployed:**
- **Video timestamp:**
- ## **Relevant files:**

### Other (with prior approval only)

- **Description:**
- **Video timestamp:**
- ## **Relevant files:**

### Other (with prior permission only)

- **Description:**
- **Video timestamp:**
- ## **Relevant files:**
