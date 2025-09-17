const express = require("express");
const app = express();
const path = require("path");

let latestFrame = null;

// Middleware to parse raw image frame uploads
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));

// Endpoint where sender pushes frames
app.post("/frame", (req, res) => {
  const frame = req.body.frame;
  if (frame) {
    latestFrame = Buffer.from(frame.split(",")[1], "base64");
  }
  res.sendStatus(200);
});

// Endpoint where dashboard fetches stream as MJPEG
app.get("/video", (req, res) => {
  res.writeHead(200, {
    "Cache-Control": "no-cache",
    "Connection": "close",
    "Content-Type": "multipart/x-mixed-replace; boundary=frame"
  });

  const interval = setInterval(() => {
    if (latestFrame) {
      res.write(`--frame\r\n`);
      res.write("Content-Type: image/jpeg\r\n\r\n");
      res.write(latestFrame);
      res.write("\r\n");
    }
  }, 150); // ~7 fps (adjust down to 100 for ~10fps)

  req.on("close", () => clearInterval(interval));
});

// Serve static files (sender.html, dashboard.html)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
