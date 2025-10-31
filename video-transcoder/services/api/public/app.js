const videoInput = document.getElementById("videoInput");
const uploadBtn = document.getElementById("uploadBtn");
const status = document.getElementById("status");
const signOutBtn = document.getElementById("signOutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const videoList = document.getElementById("videoList");

const token = localStorage.getItem("token");
if (!token) {
  alert("You must be logged in to upload videos.");
  window.location.href = "/login.html";
}

// Sign out
signOutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  window.location.href = "/login.html";
});

// ---------------- VIDEO STATUS ----------------
async function checkVideoStatus(videoId) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/videos/${videoId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.status === "PROCESSING") {
        status.textContent = "Processing...";
      } else if (data.status === "FAILED") {
        status.textContent = "Video transcoding failed.";
        clearInterval(interval);
      } else if (data.status === "COMPLETED") {
        clearInterval(interval);
        status.textContent = "Video transcoding completed!";

        // Get download link
        const downloadRes = await fetch(`/videos/${videoId}/download`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const downloadData = await downloadRes.json();

        if (downloadRes.ok && downloadData.url) {
          const link = document.createElement("a");
          link.href = downloadData.url;
          link.textContent = "Download Transcoded Video";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          status.appendChild(document.createElement("br"));
          status.appendChild(link);
        } else {
          status.textContent += " (ready, but download link not available)";
        }
      }
    } catch (err) {
      console.error("Status check error:", err);
      clearInterval(interval);
    }
  }, 4000);
}

// ---------------- LOAD USER VIDEOS ----------------
async function loadVideos() {
  try {
    const res = await fetch("/videos", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const videos = await res.json();

    videoList.innerHTML = "";

    if (!Array.isArray(videos) || videos.length === 0) {
      videoList.innerHTML = "<li>No videos uploaded yet.</li>";
      return;
    }

    videos.forEach((video) => {
      const li = document.createElement("li");
      li.textContent = `${video.originalName || video.rawKey} — ${
        video.status
      }`;

      if (video.status === "COMPLETED" && video.downloadUrl) {
        const link = document.createElement("a");
        link.href = video.downloadUrl;
        link.textContent = " [Download]";
        link.target = "_blank";
        li.appendChild(link);
      }

      videoList.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading videos:", err);
    videoList.innerHTML = "<li>Error loading videos.</li>";
  }
}

refreshBtn.addEventListener("click", loadVideos);

// ---------------- UPLOAD ----------------
uploadBtn.addEventListener("click", async () => {
  if (!videoInput.files.length) {
    status.textContent = "Please select a video file first.";
    return;
  }

  const file = videoInput.files[0];
  uploadBtn.disabled = true;
  status.textContent = "Requesting upload URL...";

  try {
    // Get pre-signed upload URL
    const urlRes = await fetch("/videos/upload-url", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const { uploadUrl, videoId } = await urlRes.json();

    if (!uploadUrl || !videoId) {
      throw new Error("Failed to get pre-signed URL");
    }

    // Upload directly to S3
    status.textContent = "Uploading video to S3...";
    const s3Res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!s3Res.ok) throw new Error("Upload to S3 failed.");

    // Trigger transcoding
    status.textContent = "Upload complete. Starting transcoding...";
    const triggerRes = await fetch(`/upload/trigger/${videoId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!triggerRes.ok) throw new Error("Failed to start transcoding.");

    status.textContent = "Transcoding started...";
    checkVideoStatus(videoId);

    // Reload videos list
    loadVideos();
  } catch (err) {
    console.error("Upload error:", err);
    status.textContent = "Upload failed.";
  } finally {
    uploadBtn.disabled = false;
  }
});

// Auto-refresh video list every 10 seconds
setInterval(loadVideos, 10000);
loadVideos();
