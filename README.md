# AI-Powered Website Cloner

A web application that can clone any website — static or dynamic — into a downloadable ZIP file. Built with **Node.js, Express, Puppeteer, Cheerio, and OpenAI API**, it automatically downloads HTML, CSS, JS, images, and fonts, and rewrites references for local use.

---

## Features

- Clone **static websites** instantly using `fetch`.
- Clone **dynamic websites** using Puppeteer for full rendering.
- Automatically download all linked assets (CSS, JS, images, fonts).
- Provides a **downloadable ZIP** with the cloned website.
- Simple **web interface** and API endpoints for programmatic use.

---

## Demo (Step-by-Step)

1. Start the App Locally

git clone https://github.com/your-username/website-cloner.git
cd website-cloner
npm install
Create a .env file in the root directory:
OPENAI_API_KEY=your_openai_api_key
PORT=3000
Run the server:
npm start

2. Access the Web Interface
Open your browser and go to:
http://localhost:3000
You should see a simple form to enter a website URL.

3. Clone a Website
Enter a valid URL, e.g.:
https://example.com
Click Clone.
The app will process the site:
Static sites are fetched directly.
Dynamic sites are rendered using Puppeteer.
After processing, the cloned website ZIP will appear in:
public/downloads/
Download the ZIP and open it locally — it should include HTML, CSS, JS, and images.

4. API Usage
POST /api/clone
curl -X POST http://localhost:3000/api/clone \
-H "Content-Type: application/json" \
-d '{"url":"https://example.com"}'
GET /api/health
curl http://localhost:3000/api/health

Project Structure
/api           → Serverless API endpoints (for Vercel)
/public        → Frontend + downloads
/js            → Frontend JS
/css           → Frontend CSS
agent.js       → AI agent & cloning logic
package.json   → Node.js dependencies
