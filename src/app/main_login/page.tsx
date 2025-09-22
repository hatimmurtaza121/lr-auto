"use client";
import Image   from "next/image";
import Link    from "next/link";
import {
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useState }  from "react";
import { useRouter } from "next/navigation";
import lrlogo        from "../../../assets/images/lrlogo.png";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [emailError, setEmailError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (e: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Provide short, user-friendly error messages
      let userFriendlyMessage;
      
      if (error.message.includes("Invalid login credentials")) {
        userFriendlyMessage = "Invalid email or password.";
      } else if (error.message.includes("User not found")) {
        userFriendlyMessage = "Account not found.";
      } else if (error.message.includes("Network")) {
        userFriendlyMessage = "Network error. Check connection.";
      } else {
        userFriendlyMessage = "Login failed. Please try again.";
      }
      
      setErrorMessage(userFriendlyMessage);
      setIsSubmitting(false);
      return;
    }

    // on success, redirect to choose team page
    router.push("/choose-team");
  };

  return (
    <div
      className="flex flex-col h-screen items-center px-4 overflow-hidden"
      style={{ 
        paddingTop: "15vh", 
        paddingBottom: "15vh",
      }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center space-y-8 z-10 mb-auto">
        <Image
          src={lrlogo}
          alt="LR Logo"
          width={140}
          height={140}
          className="drop-shadow-lg"
        />
        <Typography
          variant="h3"
          component="h2"
          className="text-gray-800 font-bold drop-shadow-lg text-center"
          sx={{ fontWeight: 500, letterSpacing: "0.5px" }}
        >
          LR Automations
        </Typography>
      </div>

      {/* Form */}
      <div className="w-full max-w-md space-y-6 px-6 z-10 my-12">
        <Card
          className="backdrop-blur-xl border border-white/20"
          sx={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
            borderRadius: "24px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.2), 0 12px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6 py-8 px-8">
              <Box textAlign="center" mb={3}>
                <Typography
                  variant="h5"
                  component="h3"
                  className="text-gray-800 font-bold mb-2"
                  sx={{ fontWeight: 700 }}
                >
                  Welcome back
                </Typography>
                <Typography variant="body1" className="text-gray-600">
                  Enter your email and password
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                  setErrorMessage(""); // Clear error when user types
                }}
                error={!!emailError}
                helperText={emailError}
                required
                margin="normal"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "12px",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.95)" },
                    "&.Mui-focused": { backgroundColor: "rgba(255,255,255,1)" },
                  },
                  "& .MuiInputLabel-root": {
                    color: "rgba(0,0,0,0.7)",
                    fontWeight: 500,
                  },
                }}
              />

              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(""); // Clear error when user types
                }}
                required
                margin="normal"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "12px",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.95)" },
                    "&.Mui-focused": { backgroundColor: "rgba(255,255,255,1)" },
                  },
                  "& .MuiInputLabel-root": {
                    color: "rgba(0,0,0,0.7)",
                    fontWeight: 500,
                  },
                }}
              />

              <Link
                href="#"
                className="text-gray-600 hover:text-gray-800 text-sm block text-center"
                prefetch={false}
              >
                Forgot password?
              </Link>
            </CardContent>

            <Box
              className="flex flex-col items-center gap-4 py-6 w-full px-8"
            >
              {/* Error Message - Positioned between password and login button */}
              {errorMessage && (
                <Alert
                  severity="error"
                  className="w-full rounded-xl mb-2 animate-fade-in"
                  sx={{
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    animation: "fadeIn 0.3s ease-in-out",
                    "& .MuiAlert-icon": {
                      color: "#dc2626",
                    },
                    "& .MuiAlert-message": {
                      fontWeight: 500,
                    },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {errorMessage}
                  </Typography>
                </Alert>
              )}

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={isSubmitting}
                startIcon={
                  isSubmitting ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : undefined
                }
                className="py-1 px-4 font-semibold text-base hover:scale-[1.02]"
                sx={{
                  backgroundColor: "#000",
                  color: "#fff",
                  height: 40,
                  fontWeight: 600,
                  fontSize: "1rem",
                  textTransform: "none",
                  borderRadius: "20px",
                  boxShadow: "0 8px 20px -5px rgba(0,0,0,0.3)",
                  "&:hover": {
                    backgroundColor: "#1a1a1a",
                    boxShadow: "0 12px 28px -5px rgba(0,0,0,0.4)",
                  },
                  "&:disabled": {
                    backgroundColor: "#666",
                    color: "#fff",
                  },
                }}
              >
                Login
              </Button>
            </Box>
          </form>
        </Card>
      </div>
    </div>
  );
} 