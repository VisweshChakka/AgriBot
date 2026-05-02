# Buddy AI Chat

Single-page AI chat app with:

- `index.html` frontend
- Vercel serverless functions in `api/`
- in-browser temporary chat history only
- configurable assistant behavior through `config.js`

Chat is not stored in a database. When the user closes the site, the conversation is gone.

## Project structure

```text
.
|-- api/
|   |-- chat.js
|   `-- health.js
|-- .env
|-- config.js
|-- index.html
|-- package.json
|-- vercel.json
`-- README.md
```

## Environment variables

Set these locally in `.env` and also in Vercel Project Settings.

```env
GEMINI_API_KEY=
GEMINI_API_KEY_1=
GEMINI_API_KEY_2=
GEMINI_API_KEY_3=
MAX_RESPONSE_TOKENS=2000
MAX_HISTORY_MESSAGES=6
```

You only need one Gemini key. `GEMINI_API_KEY` alone is enough.

## Change assistant behavior

Edit [config.js](./config.js).

Example:

```js
window.APP_CONFIG = {
    systemPrompt: 'Act like an agriculture expert who gives clear, practical instructions to farmers.'
};
```

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Fill in `.env` with at least one Gemini API key.

3. Start local Vercel development:

```bash
vercel dev
```

4. Open the local URL shown by Vercel, usually:

```text
http://localhost:3000
```

## Deploy to Vercel through GitHub

### 1. Push this project to GitHub

Create a GitHub repository and push this folder to it.

Example remote:

```text
https://github.com/your-username/your-repo.git
```

### 2. Import the repo in Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Sign in
3. Click `Add New...`
4. Click `Project`
5. Import your GitHub repository

### 3. Configure the project

Use these settings:

- Framework Preset: `Other`
- Root Directory: `./`
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: leave default

Vercel will detect the `api/` folder and treat those files as serverless functions.

### 4. Add environment variables in Vercel

In the Vercel project:

1. Open `Settings`
2. Open `Environment Variables`
3. Add the same variables from `.env`

At minimum add:

```env
GEMINI_API_KEY=your_key_here
```

Optional:

```env
MAX_RESPONSE_TOKENS=2000
MAX_HISTORY_MESSAGES=6
```

### 5. Deploy

After saving environment variables:

1. Go back to the project dashboard
2. Trigger deploy if it did not start automatically
3. Wait for deployment to complete

Once done, Vercel will give you a production URL.

## Redeploy after changes

After you change the code:

1. Commit your changes
2. Push to GitHub
3. Vercel will automatically redeploy if the repo is connected

## Notes

- `index.html` uses Tailwind through the CDN
- `api/chat.js` handles chat and API status
- `api/health.js` handles app health checks
- no MongoDB is required
- no login/signup is included
