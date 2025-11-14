# S3 Access Denied Fix

## Problem
Profile pictures uploaded to S3 return "Access Denied" error when accessed directly.

## Solutions Implemented

### 1. ACL Configuration (Primary Solution)
Added `acl: 'public-read'` to the profile picture storage configuration in `middleware/upload.js`.

**Note:** This requires your S3 bucket to allow ACLs. If your bucket has "Block all public access" enabled, you need to:

#### Option A: Enable ACLs (Recommended for profile pictures)
1. Go to AWS S3 Console
2. Select your bucket
3. Go to "Permissions" tab
4. Edit "Block public access" settings
5. Uncheck "Block public ACLs" and "Block public bucket policies"
6. Save changes

#### Option B: Update Bucket Policy
Add this policy to your S3 bucket (replace `YOUR-BUCKET-NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadProfilePictures",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/profile-pictures/*"
    }
  ]
}
```

### 2. Signed URLs (Fallback Solution)
Created `utils/s3Helper.js` that generates temporary signed URLs (valid for 24 hours).

**Features:**
- Automatically generates signed URLs when retrieving user data
- Works even if bucket is private
- URLs expire after 24 hours for security
- Fallback to original URL if signing fails

## How It Works

1. **Upload:** File is uploaded to S3 with `public-read` ACL
2. **Storage:** S3 URL is stored in database
3. **Retrieval:** 
   - If URL contains 's3', generate a signed URL
   - Otherwise, return the original URL
4. **Display:** Frontend displays the signed URL

## Testing

1. Upload a profile picture
2. Check the response - should contain a valid URL
3. Open the URL in browser - should display the image
4. If still getting "Access Denied", check:
   - S3 bucket permissions
   - ACL settings
   - Bucket policy

## Environment Variables

Make sure these are set in your `.env`:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_S3_BUCKET=your_bucket_name
AWS_S3_PROFILE_PICTURES_PREFIX=profile-pictures/
```

## Files Modified

1. `middleware/upload.js` - Added ACL configuration
2. `utils/s3Helper.js` - Created signed URL helper
3. `controllers/employeeController.js` - Updated to use signed URLs
   - `getUserById` - Returns signed URL for profile picture
   - `uploadProfilePicture` - Returns signed URL in response

## Security Notes

- Signed URLs expire after 24 hours
- Profile pictures are public by design (for display purposes)
- Other employee attachments remain private
- Only authenticated users can upload profile pictures
