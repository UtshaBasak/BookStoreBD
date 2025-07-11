import React, { useEffect } from "react";
import socket from "./socket";

function App() {
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to socket server");
    });

    // Example: Listen for a custom event
    socket.on("message", (data) => {
      console.log("Received message:", data);
    });

    // Cleanup on unmount
    return () => {
      socket.off("connect");
      socket.off("message");
    };
  }, []);

  return (
    <div className="App">
      {/* ...existing components... */}
    </div>
  );
}

export default App;