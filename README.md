# CV Assistant - AI-Powered Cover Letter Generator

A modern, professional web application that uses AI to generate personalized cover letters based on job descriptions and user profiles. Built with Next.js 15, TypeScript, and Tailwind CSS.

![CV Assistant Demo](https://cva-mauve.vercel.app/)


## ✨ Features

### 🎯 Core Functionality
- **AI-Powered Analysis**: Analyzes job descriptions and user profiles to identify relevant skills and experiences
- **Smart Content Generation**: Creates personalized, professional cover letters in minutes
- **Profile Management**: Store and manage your professional experience, skills, and projects
- **Real-time Generation**: Instant cover letter creation with copy-to-clipboard functionality

### 🎨 User Experience
- **Modern Design**: Beautiful, responsive UI with gradient backgrounds and smooth animations
- **Dark/Light Mode**: Toggle between themes with persistent preferences
- **Professional Styling**: Clean, modern interface that builds trust and credibility
- **Mobile Responsive**: Optimized for all device sizes

### 🔧 Technical Features
- **TypeScript**: Full type safety and better development experience
- **Next.js 15**: Latest features with App Router and Server Components
- **Tailwind CSS**: Utility-first styling with custom design system
- **MongoDB**: Scalable database for user profiles and data storage
- **JWT Authentication**: Secure user authentication and session management
- **Google Gemini AI**: Advanced AI for intelligent content generation

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- MongoDB database
- Google Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cv-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   # Database
   MONGODB_URI=your_mongodb_connection_string
   
   # Authentication
   JWT_SECRET=your_jwt_secret_key
   
   # Google Gemini AI
   GEMINI_API_KEY=your_gemini_api_key
   
   # Optional: For production
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_nextauth_secret
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
cv-assistant/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── auth/         # Authentication endpoints
│   │   │   ├── generate/     # Cover letter generation
│   │   │   ├── ocr/          # OCR functionality
│   │   │   └── profile/      # Profile management
│   │   ├── generate/         # Cover letter generation page
│   │   ├── login/            # Authentication pages
│   │   ├── profile/          # Profile management page
│   │   ├── globals.css       # Global styles
│   │   └── layout.tsx        # Root layout
│   ├── components/           # Reusable components
│   │   └── Navbar.tsx        # Navigation component
│   ├── contexts/             # React contexts
│   │   └── ThemeContext.tsx  # Dark/light mode context
│   └── lib/                  # Utility libraries
│       ├── auth.ts           # Authentication utilities
│       ├── db.ts             # Database connection
│       ├── gemini.ts         # AI integration
│       └── models/           # Database models
├── public/                   # Static assets
├── tailwind.config.ts        # Tailwind configuration
├── next.config.ts           # Next.js configuration
└── package.json             # Dependencies and scripts
```

## 🛠️ Configuration

### Tailwind CSS
The project uses a custom design system with CSS variables for consistent theming:

```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... more variables */
}
```

### Database Schema
The application uses MongoDB with the following main collections:

- **Users**: Authentication and profile information
- **Experiences**: Professional experience entries
- **Projects**: Project portfolio items
- **Skills**: User skills and competencies

## 🎯 Usage Guide

### 1. Getting Started
1. **Register/Login**: Create an account or sign in
2. **Complete Profile**: Add your professional experience, skills, and projects
3. **Generate Cover Letters**: Use the AI-powered generator

### 2. Creating a Cover Letter
1. Navigate to the **Generate** page
2. Enter the **Company Name**
3. Paste the **Job Description**
4. Choose whether to use AI for skill matching
5. Click **Generate Cover Letter**
6. Copy or customize the result

### 3. Profile Management
- **Add Experience**: Include job titles, companies, and descriptions
- **Add Projects**: Showcase your portfolio with detailed descriptions
- **Manage Skills**: List your technical and soft skills
- **Update Information**: Keep your profile current

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Vercel (if using Vercel CLI)
npx vercel dev       # Start Vercel development server
npx vercel --prod    # Deploy to production
```

### Code Style
- **TypeScript**: Strict type checking enabled
- **ESLint**: Configured with Next.js recommended rules
- **Prettier**: Code formatting (recommended)

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `NEXTAUTH_URL` | Application URL | No |
| `NEXTAUTH_SECRET` | NextAuth secret | No |

## 🚀 Deployment

### Vercel (Recommended)
1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Set Environment Variables**: Add all required environment variables
3. **Deploy**: Vercel will automatically build and deploy your app

### Manual Deployment
1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Start the production server**:
   ```bash
   npm run start
   ```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔒 Security

### Authentication
- JWT-based authentication
- Secure password hashing with bcrypt
- Protected API routes

### Data Protection
- Input validation and sanitization
- MongoDB injection protection
- Secure environment variable handling

### API Security
- Rate limiting (recommended for production)
- CORS configuration
- Request validation

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript best practices
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📝 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Profile Endpoints
- `GET /api/profile` - Get user profile
- `POST /api/profile` - Update user profile

### Generation Endpoints
- `POST /api/generate/cover-letter` - Generate cover letter
- `POST /api/generate/select` - Select relevant items

## 🐛 Troubleshooting

### Common Issues

**Build Errors**
- Ensure all environment variables are set
- Check Node.js version (18+ required)
- Clear `.next` cache: `rm -rf .next`

**Database Connection**
- Verify MongoDB URI format
- Check network connectivity
- Ensure database permissions

**AI Generation Issues**
- Verify Gemini API key
- Check API quota limits
- Review request format

### Performance Optimization
- Enable Next.js caching
- Optimize images and assets
- Use CDN for static files
- Implement database indexing

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Next.js Team** for the amazing framework
- **Tailwind CSS** for the utility-first CSS framework
- **Google Gemini** for AI capabilities
- **MongoDB** for the database solution

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Email**: support@cvassistant.com

---

**Made with ❤️ by [Your Name]**

*Transform your job applications with AI-powered cover letters that stand out to employers.*
