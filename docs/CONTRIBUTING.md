# 🌈 Contributing to GoShare

First off, thank you for considering contributing to GoShare! It's people like you that make GoShare such a great tool for the community.

## 🚀 How Can I Contribute?

### 🐛 Reporting Bugs
- Check the [issues](https://github.com/tanvir-cpp/GoShare/issues) tab to see if the bug has already been reported.
- If not, create a new issue. Include a clear title, description, and steps to reproduce.

### ✨ Suggesting Enhancements
- Open a new issue with the tag "enhancement".
- Explain the feature and why it would be useful for the project.

### 🛠️ Pull Requests
1. **Fork** the repository and create your branch from `main`.
2. **Commit** your changes with clear, descriptive commit messages.
3. **Draft** a Pull Request briefly explaining your changes.
4. **Pass Checks**: Ensure the code compiles and follows the style guide.

---

## 💻 Technical Stack

GoShare is built with a focus on minimalism and performance:
- **Backend**: Go 1.24+ (Standard Library only - no external frameworks).
- **Frontend**: Vanilla ES6+ JavaScript, Custom CSS.
- **Real-time**: Server-Sent Events (SSE) for discovery, WebRTC for P2P.
- **UI**: The **Aero Design System** (Glassmorphism, Vanilla CSS).

---

## 🎨 Coding Standards

To maintain the project's high code quality and minimalist philosophy:

### Backend (Go)
- Follow **idiomatic Go** patterns (`gofmt`, `go vet`).
- Avoid adding third-party dependencies unless absolutely necessary.
- Use `sync.RWMutex` for thread-safe state management.
- Ensure all handlers include proper error logging and status codes.

### Frontend (Vanilla Stack)
- **Framework-Free**: Do not add React, Vue, or Tailwind. Use Vanilla JS and CSS.
- **Design Tokens**: Use the CSS variables defined in `web/static/css/` to maintain the Aero aesthetic.
- **Responsive**: Ensure all UI changes work on both Desktop and Mobile.
- **Clean Logic**: Keep DOM manipulation efficient and avoid unnecessary library dependencies.

## 📄 License
By contributing, you agree that your contributions will be licensed under its MIT License.
