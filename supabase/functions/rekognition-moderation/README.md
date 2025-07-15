# Rekognition Moderation Edge Function

This Supabase Edge Function provides NSFW content detection using AWS Rekognition's DetectModerationLabels API.

## Setup

1. Deploy the function:
```bash
supabase functions deploy rekognition-moderation
```

2. Set the required secrets:
```bash
supabase secrets set AWS_ACCESS_KEY_ID=your_aws_access_key_id
supabase secrets set AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
supabase secrets set AWS_REGION=us-east-1
```

## Usage

The function accepts POST requests with the following payload:

```json
{
  "image_base64": "base64_encoded_image_data",
  "image_id": "unique_image_identifier"
}
```

## Response

```json
{
  "image_id": "unique_image_identifier",
  "is_nsfw": false,
  "moderation_labels": [
    {
      "Name": "Label Name",
      "Confidence": 95.5,
      "ParentName": "Parent Category"
    }
  ],
  "confidence_score": 95.5
}
```

## Configuration

- **NSFW_CONFIDENCE_THRESHOLD**: 80 (minimum confidence to flag as NSFW)
- **Image Size Limit**: 5MB
- **Supported Formats**: JPEG, PNG

## NSFW Categories

The function checks for the following categories:
- Explicit Nudity
- Suggestive
- Violence
- Visually Disturbing
- Rude Gestures
- Drugs
- Tobacco
- Alcohol
- Gambling
- Hate Symbols

## Error Handling

The function includes comprehensive error handling for:
- Invalid image formats
- Image size limits
- AWS API errors
- Network timeouts
- Invalid requests

## Security

- AWS credentials are stored as Supabase secrets
- Images are processed in-memory only
- No data is stored permanently
- CORS headers are properly configured