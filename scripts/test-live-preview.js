const io = require("socket.io-client");
const fs = require('fs');

const socket = io("http://localhost:4000");

const targetScreenId = process.argv[2] || "12345";

socket.on("connect", () => {
    console.log("[ADMIN CLIENT] Connected. Socket ID:", socket.id);
    console.log(`[ADMIN CLIENT] Requesting live preview for screen: ${targetScreenId}`);

    // Request a live preview
    socket.emit("request-live-preview", { screenId: targetScreenId });
});

socket.on("live-preview-frame-response", (data) => {
    console.log(`[ADMIN CLIENT] Received live preview from screen: ${data.screenId}`);
    const base64Data = data.frameData.replace(/^data:image\/jpeg;base64,/, "");

    fs.writeFile("live-preview-output.jpg", base64Data, 'base64', function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log("[ADMIN CLIENT] Successfully saved frame to live-preview-output.jpg!");
            process.exit(0);
        }
    });
});

socket.on("disconnect", () => {
    console.log("[ADMIN CLIENT] Disconnected");
});
