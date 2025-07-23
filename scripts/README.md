# Login Script with Captcha Solving

This script automatically handles login with captcha solving using Google's Gemini Flash 2.0 model.

## Setup

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the API key

### 2. Configure the API Key

You have two options to set the API key:

#### Option A: Environment Variable (Recommended)
Create a `.env` file in the project root:
```
GEMINI_API_KEY=your-actual-api-key-here
```

#### Option B: Direct Configuration
Edit `scripts/config.js` and replace the placeholder:
```javascript
GEMINI_API_KEY: 'your-actual-api-key-here',
```

## Usage

### Basic Usage
```bash
node scripts/login.js
```

### With Custom Credentials
```bash
node scripts/login.js username password
```

## How It Works

1. **Captcha Detection**: The script automatically detects captcha elements on the login page
2. **Screenshot Capture**: Takes a screenshot of the captcha image or area
3. **AI Processing**: Sends the image to Gemini Flash 2.0 model for text recognition
4. **Auto-fill**: Automatically fills the captcha input field with the recognized text
5. **Login**: Proceeds with the login process

## Features

- ✅ Automatic captcha detection
- ✅ Screenshot capture of captcha elements
- ✅ AI-powered text recognition using Gemini Flash 2.0
- ✅ Automatic form filling
- ✅ Fallback screenshot of page area if specific captcha element not found
- ✅ Configurable timeouts and settings
- ✅ Error handling and logging

## Configuration

Edit `scripts/config.js` to customize:
- API keys
- Default credentials
- Screenshot paths
- Timeout settings
- Browser behavior

## Troubleshooting

### Common Issues

1. **"Could not read captcha text from Gemini response"**
   - The captcha image might be too blurry or distorted
   - Try refreshing the page to get a new captcha
   - Check if the API key is valid

2. **"No captcha input field found"**
   - The website might have changed its structure
   - Check if the selectors in the script need updating

3. **API Key Issues**
   - Ensure your Gemini API key is valid and has sufficient quota
   - Check if the API key is properly set in the configuration

### Debug Mode

The script runs in non-headless mode by default so you can see what's happening. You can change this in `config.js`:
```javascript
BROWSER_HEADLESS: true, // Set to false for debugging
```

## Dependencies

- `playwright`: Browser automation
- `@google/genai`: Gemini AI API
- `dotenv`: Environment variable loading
- `fs`: File system operations

## Security Notes

- Never commit your API key to version control
- Use environment variables for sensitive data
- The captcha screenshot is saved temporarily and can be deleted after use 