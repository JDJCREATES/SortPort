// Simple script to create the nsfw-temp-processing bucket
// Run this in your browser console on the Supabase dashboard

const createBucket = async () => {
  try {
    // This assumes you're logged into Supabase dashboard
    const response = await fetch(`${window.location.origin}/dashboard/project/${window.location.pathname.split('/')[2]}/storage/buckets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'nsfw-temp-processing',
        public: false,
        allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain'],
        file_size_limit: 10485760, // 10MB
        avif_autodetection: false
      })
    });

    if (response.ok) {
      console.log('✅ Bucket created successfully!');
      window.location.reload();
    } else {
      console.error('❌ Failed to create bucket:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Call it
createBucket();
