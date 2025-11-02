const crypto = require("crypto");
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
} = require("@aws-sdk/client-cognito-identity-provider");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

// AWS Cognito client
const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

// Config from env
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;
const clientSecret = process.env.COGNITO_CLIENT_SECRET || null; // optional

// Utility: generate Cognito secret hash if client secret is enabled
function secretHash(clientId, clientSecret, username) {
  const hasher = crypto.createHmac("sha256", clientSecret);
  hasher.update(`${username}${clientId}`);
  return hasher.digest("base64");
}

// Register a new user
async function register(username, email, password) {
  const params = {
    ClientId: clientId,
    Username: username,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }],
  };

  if (clientSecret) {
    params.SecretHash = secretHash(clientId, clientSecret, username);
  }

  const command = new SignUpCommand(params);
  return client.send(command);
}

// Confirm user with email code
async function confirm(username, code) {
  const params = {
    ClientId: clientId,
    Username: username,
    ConfirmationCode: code,
  };

  if (clientSecret) {
    params.SecretHash = secretHash(clientId, clientSecret, username);
  }

  const command = new ConfirmSignUpCommand(params);
  return client.send(command);
}

// Login and return tokens
async function login(username, password) {
  const params = {
    AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
    ClientId: clientId,
  };

  if (clientSecret) {
    params.AuthParameters.SECRET_HASH = secretHash(
      clientId,
      clientSecret,
      username
    );
  }

  const command = new InitiateAuthCommand(params);
  const result = await client.send(command);
  return result.AuthenticationResult; // contains IdToken, AccessToken, RefreshToken
}

// Middleware: verify Cognito JWT
const verifier = CognitoJwtVerifier.create({
  userPoolId,
  clientId,
  tokenUse: "id", // we expect IdToken from frontend
});

async function verifyToken(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const payload = await verifier.verify(token);
    req.user = { username: payload["cognito:username"], email: payload.email };
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { register, confirm, login, verifyToken };
