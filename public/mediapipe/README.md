# MediaPipe runtime

`npm run prepare:mediapipe` copies the pinned `@mediapipe/tasks-vision` WASM
runtime here before development and production builds. Generated WASM files are
ignored so a clean checkout stays small and `node_modules` remains the source of
truth.

Mimic Rush downloads only Google's versioned Face Landmarker model when the
player explicitly starts the camera mode. Hand recognition is intentionally not
loaded. Camera frames are processed in a browser worker and are not uploaded to
the Camera Quest backend. MediaPipe's own privacy notice still applies to the SDK
runtime.
