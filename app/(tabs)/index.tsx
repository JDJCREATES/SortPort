import { useEffect } from 'react';
import { router } from 'expo-router';

export default function IndexRedirect() {
  useEffect(() => {
    // Redirect to albums tab immediately
    router.replace('/albums');
  }, []);

  // Return null since this component should never render
  return null;
}
