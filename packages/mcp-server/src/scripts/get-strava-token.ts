// scripts/get-strava-token.ts
import express from "express";
import axios from "axios";
import open from "open";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/callback";
const PORT = 3000;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in your .env file"
  );
  process.exit(1);
}

const app = express();
let server: any;

app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.send(`<h1>Error: ${error}</h1>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.send("<h1>No authorization code received</h1>");
    server.close();
    process.exit(1);
  }

  try {
    // Exchange code for token
    const response = await axios.post(
      "https://www.strava.com/api/v3/oauth/token",
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code as string,
        grant_type: "authorization_code",
      }
    );

    const { access_token, refresh_token, expires_at, athlete } = response.data;

    // Display the tokens
    res.send(`
      <html>
        <head>
          <title>Strava OAuth Success</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .success { color: green; }
            .token-box { background: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0; }
            code { background: #333; color: #0f0; padding: 10px; display: block; border-radius: 3px; word-break: break-all; }
            .instructions { background: #e0f0ff; padding: 20px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Successfully authenticated with Strava!</h1>
          
          <p>Welcome, <strong>${athlete.firstname} ${
      athlete.lastname
    }</strong>!</p>
          
          <div class="token-box">
            <h2>Your Refresh Token (save this!):</h2>
            <code>${refresh_token}</code>
          </div>
          
          <div class="instructions">
            <h2>Next Steps:</h2>
            <ol>
              <li>Copy the refresh token above</li>
              <li>Add it to your <code>.env</code> file:
                <pre>STRAVA_CLIENT_ID=${CLIENT_ID}
STRAVA_CLIENT_SECRET=${CLIENT_SECRET}
STRAVA_REFRESH_TOKEN=${refresh_token}</pre>
              </li>
              <li>You can now close this window and stop the script</li>
            </ol>
          </div>
          
          <p><em>Access token expires at: ${new Date(
            expires_at * 1000
          ).toLocaleString()}</em></p>
        </body>
      </html>
    `);

    console.log("\n✅ Success! Here are your tokens:\n");
    console.log("REFRESH TOKEN (save this in .env):");
    console.log(refresh_token);
    console.log(
      "\nYou can now close the browser and stop this script (Ctrl+C)"
    );
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    res.send("<h1>Error exchanging code for token</h1>");
    server.close();
    process.exit(1);
  }
});

// Start server and open browser
server = app.listen(PORT, () => {
  console.log(`\n🚀 OAuth server running on http://localhost:${PORT}`);
  console.log("Opening browser for Strava authorization...\n");

  const authUrl =
    `https://www.strava.com/oauth/authorize?` +
    `client_id=${CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${REDIRECT_URI}&` +
    `approval_prompt=force&` +
    `scope=read,activity:read_all,profile:read_all`;

  // Open the authorization URL in the default browser
  open(authUrl);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down OAuth server...");
  server.close();
  process.exit(0);
});
