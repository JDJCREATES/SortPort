## Relevant Tables/Schemas

# virtual_image

| Column | Description | Data Type | Format | Nullable |
|--------|-------------|-----------|---------|----------|
| id | Image ID, generated once and used for image tracking along with the user ID | uuid | uuid | No |
| user_id | Uniquely tied to one user. | uuid | uuid | No |
| original_path | The original path the image is at on the user's device, used for loading/exporting | text | text | Yes |
| original_name | The original name of the image, in case user wants it changed back | text | text | Yes |
| hash | No description | text | text | Yes |
| thumbnail | Thumbnail location | text | text | Yes |
| virtual_name | Name used within our application | text | text | Yes |
| virtual_tags | Main tags inferred from all other metadata by the Agentic AI Server | ARRAY | text | Yes |
| virtual_albums | Which albums the image belongs to | ARRAY | text | Yes |
| virtual_description | Main description used and updated by the Agentic AI Server backend | text | text | Yes |
| nsfw_score | AI's NSFW confidence score | double precision | float8 | Yes |
| isflagged | Whether the image is NSFW or not | boolean | bool | Yes |
| caption | Short caption that describes the image for use in the Front End ui display | text | text | Yes |
| vision_summary | Summary from GPT-Vision IF and only if it's needed for sorting | text | text | Yes |
| vision_sorted | No description | boolean | bool | Yes |
| metadata | jsonb metadata about the image | jsonb | jsonb | Yes |
| embedding | No description | USER-DEFINED | vector | Yes |
| created_at | No description | timestamp with time zone | timestamptz | No |
| updated_at | No description | timestamp with time zone | timestamptz | No |
| sortorder | No description | integer | int4 | Yes |
| date_taken | Actual photo capture date extracted from EXIF metadata | timestamp with time zone | timestamptz | Yes |
| date_modified | File modification date from the original file system | timestamp with time zone | timestamptz | Yes |
| date_imported | Timestamp when the image was first imported into the system <- should link to sourcefolderpicker | timestamp with time zone | timestamptz | Yes |
| location_lat | GPS latitude coordinate extracted from EXIF or user-provided | double precision | float8 | Yes |
| location_lng | GPS longitude coordinate extracted from EXIF or user-provided | double precision | float8 | Yes |
| location_name | Human-readable location name (e.g., "Home", "Paris", "Central Park") | text | text | Yes |
| location_country | Country name where the photo was taken | text | text | Yes |
| location_city | City name where the photo was taken | text | text | Yes |
| dominant_colors | Array of dominant colors in the image as hex values for color-based sorting | jsonb | jsonb | Yes |
| detected_objects | Array of objects detected in the image (e.g., ["person", "car", "dog"]) | ARRAY | text | Yes |
| detected_faces_count | Number of human faces detected in the image | integer | int4 | Yes |
| scene_type | Type of scene (e.g., "indoor", "outdoor", "beach", "cave", "outer space" etc.) | text | text | Yes |
| brightness_score | AI-calculated brightness score (0.0-1.0) for sorting by light/dark images | double precision | float8 | Yes |
| blur_score | AI-calculated sharpness score (0.0-1.0) where higher values indicate sharper images | double precision | float8 | Yes |
| quality_score | AI-assessed overall image quality score (0.0-1.0) | double precision | float8 | Yes |
| aesthetic_score | AI-assessed aesthetic/beauty score (0.0-1.0) for composition and visual appeal | double precision | float8 | Yes |
| emotion_detected | Array of emotions detected in faces (e.g., ["happy", "sad", "surprised"]) | ARRAY | text | Yes |
| activity_detected | Array of activities or contexts detected (e.g., ["sports", "cooking", "travel"]) | ARRAY | text | Yes |
| image_orientation | Orientation of the image [eg "portrait", "landscape"] | text | text | Yes |