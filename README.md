# CV Assistant - AI-Powered Cover Letter Generator

A modern web application that helps users create personalized cover letters using AI and their professional profile information.

[Live Demo](https://cva-mauve.vercel.app)

## Features

- **User Authentication**: Secure login/register system with bcrypt password hashing
- **Profile Management**: Comprehensive profile builder with projects and work experiences
- **AI Resume Parsing**: Upload PDF resumes and automatically extract information using Gemini AI
- **Smart Skill Matching**: AI-powered analysis to identify relevant projects and experiences for specific job descriptions
- **Cover Letter Generation**: Generate professional, personalized cover letters using Gemini AI
- **Modern UI**: Responsive design with intuitive user experience

## Tech Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **JWT** for authentication
- **Google Gemini AI** for AI-powered features
- **Multer** for file uploads
- **PDF-parse** for resume text extraction

### Frontend
- **React 18** with modern hooks
- **React Router** for navigation
- **Axios** for API communication
- **React Dropzone** for file uploads
- **Responsive CSS** with modern design

## Prerequisites

- Node.js (v16 or higher)
- MongoDB database
- Google Gemini API key

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Gemini API Key for AI tasks
GEMINI_API_KEY=your_gemini_api_key_here

# MongoDB Connection URI
MONGO_URI=mongodb://localhost:27017/cv-assistant

# JWT Secret for authentication
JWT_SECRET=your_jwt_secret_here

# Server Port
PORT=5000
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CV-Assistant
   ```

2. **Install backend dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

4. **Set up environment variables**
   - Copy `env.example` to `.env`
   - Fill in your actual values

5. **Start the development servers**

   **Option 1: Run both servers separately**
   ```bash
   # Terminal 1 - Backend
   npm run dev
   
   # Terminal 2 - Frontend
   npm run client
   ```

   **Option 2: Run both with one command**
   ```bash
   npm run dev
   npm run client
   ```

## Usage

### 1. User Registration/Login
- Navigate to `/register` to create a new account
- Use `/login` to sign in with existing credentials

### 2. Profile Building
- Fill in basic information (name, major, school, graduation year)
- Add skills by typing and pressing Enter
- Upload your resume PDF for AI-powered information extraction
- Manually add/edit projects and work experiences
- Click "Save Profile" to store everything in MongoDB

### 3. Cover Letter Generation
- Navigate to the Generate page
- Enter company name and job description
- Optionally enable AI skill matching for relevant content selection
- Click "Generate Cover Letter" to create a personalized cover letter
- Copy to clipboard or download as text file

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

### Profile Management
- `GET /api/profile` - Get user profile
- `POST /api/profile` - Create/update profile
- `POST /api/profile/parse-resume` - Parse uploaded resume PDF

### Cover Letter Generation
- `POST /api/generate/analyze` - Analyze job description for relevant skills
- `POST /api/generate/cover-letter` - Generate cover letter

## AI Features

### Resume Parsing
- Uses Gemini 2.0 Flash Exp model for OCR and text extraction
- Automatically structures information into profile fields
- Multiple retry attempts for valid JSON responses

### Skill Matching
- Analyzes job descriptions against user profile
- Identifies most relevant projects and experiences
- Provides reasoning for selections

### Cover Letter Generation
- Creates professional, personalized cover letters
- Incorporates relevant profile information
- Maintains professional tone and structure

## Project Structure

```
CV-Assistant/
├── client/                 # React frontend
│   ├── public/            # Static files
│   ├── src/               # Source code
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   └── ...
│   └── package.json
├── models/                 # MongoDB models
├── routes/                 # API routes
├── middleware/             # Express middleware
├── server.js              # Main server file
├── package.json           # Backend dependencies
└── README.md
```

## Development

### Backend Development
```bash
npm run dev          # Start with nodemon
npm start            # Start production server
```

### Frontend Development
```bash
cd client
npm start            # Start React dev server
npm run build        # Build for production
```

## Production Deployment

1. **Build the frontend**
   ```bash
   cd client
   npm run build
   cd ..
   ```

2. **Set production environment variables**
   ```env
   NODE_ENV=production
   ```

3. **Start the server**
   ```bash
   npm start
   ```

## Security Features

- **Password Hashing**: bcrypt with salt rounds
- **JWT Authentication**: Secure token-based auth
- **Input Validation**: Express-validator for data sanitization
- **CORS Protection**: Configurable cross-origin settings
- **File Upload Limits**: Restricted file types and sizes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support or questions, please open an issue in the repository.
