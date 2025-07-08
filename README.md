# SnapSort - AI-Powered Photo Organization

SnapSort is a React Native Expo application that uses AI to automatically organize your photos using natural language prompts.

## Features

- 🤖 AI-powered photo sorting using OpenAI GPT-4 Vision
- 📱 Cross-platform support (iOS, Android, Web)
- 🔒 NSFW content detection and filtering using AWS Rekognition
- 📁 Smart album creation and management
- 🎯 Natural language photo queries
- 🔐 User authentication with Supabase
- 💳 Premium features with RevenueCat integration

## Tech Stack

- **Framework**: React Native with Expo SDK 53
- **Navigation**: Expo Router
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI/ML**: OpenAI GPT-4 Vision, AWS Rekognition
- **Payments**: RevenueCat
- **State Management**: React Context + useReducer
- **Styling**: StyleSheet (React Native)
- **Icons**: @expo/vector-icons

## Prerequisites

- Node.js 18+ 
- Expo CLI
- Supabase account
- OpenAI API key
- AWS account (for Rekognition)
- RevenueCat account (for payments)

## Environment Variables

Create a `.env` file in the root directory:

```env
# OpenAI
EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key

# Supabase
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# RevenueCat
EXPO_PUBLIC_REVENUECAT_API_KEY=your_revenuecat_key
EXPO_PUBLIC_REVENUECAT_IOS_KEY=your_ios_key
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=your_android_key
```

## Supabase Setup

### 1. Database Schema

Run the migrations in the `supabase/migrations` folder to set up the database schema:

- User profiles
- Albums and sort sessions
- NSFW moderation tables

### 2. Edge Functions

Deploy the Supabase Edge Function for NSFW moderation:

```bash
supabase functions deploy rekognition-moderation
```

Set the required secrets for the Edge Function:

```bash
supabase secrets set AWS_ACCESS_KEY_ID=your_aws_access_key
supabase secrets set AWS_SECRET_ACCESS_KEY=your_aws_secret_key  
supabase secrets set AWS_REGION=your_aws_region
```

### 3. Row Level Security (RLS)

The migrations automatically set up RLS policies to ensure users can only access their own data.

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables
4. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── app/                    # App routes (Expo Router)
│   ├── (tabs)/            # Tab navigation
│   ├── _layout.tsx        # Root layout
│   ├── welcome.tsx        # Onboarding screen
│   └── new-sort.tsx       # AI sorting interface
├── components/            # Reusable components
├── contexts/              # React contexts
├── hooks/                 # Custom hooks
├── utils/                 # Utility functions
├── types/                 # TypeScript type definitions
└── supabase/             # Database migrations and functions
```

## Key Features

### AI Photo Sorting

Users can describe what they want to sort using natural language:
- "Find all my receipts and bills"
- "Organize my vacation photos"
- "Sort screenshots from apps"

The app uses OpenAI GPT-4 Vision to analyze images and automatically create smart albums.

### NSFW Content Detection

AWS Rekognition automatically scans photos for inappropriate content:
- Configurable sensitivity levels
- Separate albums for filtered content
- Premium users can access filtered content

### Premium Features

- Unlimited AI sorting
- Advanced NSFW filtering controls
- Album export functionality
- Custom themes and colors
- Auto-sorting of new photos

## Development

### Running on Different Platforms

```bash
# Web
npm run dev

# iOS Simulator
npm run ios

# Android Emulator  
npm run android
```

### Building for Production

```bash
# Web build
npm run build:web

# Native builds (requires EAS)
eas build --platform ios
eas build --platform android
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.