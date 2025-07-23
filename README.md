# Game Automation Dashboard

A comprehensive automation platform for managing game scripts with advanced features including AI-powered captcha solving.

## Features

- 🎮 **Multi-Game Support**: Manage automation scripts for multiple games
- 🏢 **Team Management**: Multi-tenant support with team-based access control
- 🤖 **AI Captcha Solving**: Automatic captcha detection and solving using Google Gemini Flash 2.0
- 🔐 **Secure Authentication**: Automated login with state persistence
- 📊 **Dashboard Interface**: Modern React-based UI for script management
- ⚡ **Real-time Execution**: Run scripts directly from the dashboard
- 🔧 **Configurable**: Easy configuration for different games and settings

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Gemini API (for captcha solving)
1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a `.env` file in the project root:
   ```
   GEMINI_API_KEY=your-actual-api-key-here
   ```

### 3. Test the Setup
```bash
npm run test:gemini
```

### 4. Start the Development Server
```bash
npm run dev
```

## Team Management

The platform now supports multi-tenant team management:

### How It Works
1. **Team Selection**: After login, users must select a team to continue
2. **Session Persistence**: Selected team is stored in localStorage for the session
3. **API Integration**: All session-inserting APIs use the selected team as default
4. **Team Context**: Dashboard displays the currently selected team

### Team Selection Flow
1. User logs in successfully
2. Redirected to `/choose-team` page
3. Selects a team from the dropdown
4. Team selection is saved and user is redirected to dashboard
5. Dashboard shows selected team name in the navbar

### API Endpoints
- `GET /api/teams` - Fetch all available teams
- `GET /api/team-selection?teamId={id}` - Get team details
- `POST /api/team-selection` - Validate team selection

## Captcha Solving

The platform includes advanced captcha solving capabilities:

### How It Works
1. **Automatic Detection**: Scans login pages for captcha elements
2. **Screenshot Capture**: Takes high-quality screenshots of captcha images
3. **AI Processing**: Uses Gemini Flash 2.0 for text recognition
4. **Auto-fill**: Automatically fills captcha input fields
5. **Cleanup**: Removes temporary files after processing

### Supported Captcha Types
- Text-based captchas
- Image captchas
- Canvas-based captchas
- Various input field formats

## Script Management

### Available Games
- Game Vault
- Orion Stars
- Orion Strike
- Mr. All In One
- Yolo
- Juwa City

### Script Actions
- New Account Creation
- Password Reset
- Recharge Operations
- Redeem Operations

## Configuration

Edit `scripts/config.js` to customize:
- API keys and credentials
- Timeout settings
- Browser behavior
- Screenshot paths

## Usage

### Command Line
```bash
# Basic login
npm run login

# Login with custom credentials
node scripts/login.js username password
```

### Dashboard
1. Open the web interface
2. Select a game
3. Choose an action
4. Fill in required parameters
5. Execute the script

## Development

### Project Structure
```
├── app/                 # Next.js app directory
├── components/          # React components
├── scripts/            # Automation scripts
│   ├── config.js       # Configuration
│   ├── login.js        # Login with captcha solving
│   └── README.md       # Script documentation
├── src/                # Source files
└── package.json        # Dependencies and scripts
```

### Adding New Games
1. Create a new directory in `scripts/` (e.g., `scripts/game-name/`)
2. Add action scripts (action1.js, action2.js, etc.)
3. Update the games list in `app/page.tsx`
4. Configure game-specific settings in `scripts/config.js`

## Troubleshooting

### Common Issues

1. **Gemini API Errors**
   - Verify your API key is correct
   - Check your API quota
   - Ensure the key has proper permissions

2. **Captcha Detection Issues**
   - Update selectors in `login.js` if website structure changes
   - Check browser console for errors
   - Verify captcha elements are visible

3. **Login Failures**
   - Check credentials in `scripts/config.js`
   - Verify website is accessible
   - Review browser automation logs

## Security

- API keys are stored in environment variables
- Temporary files are automatically cleaned up
- No sensitive data is logged or stored
- Use HTTPS for production deployments

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for educational and automation purposes. Please ensure compliance with target websites' terms of service. 