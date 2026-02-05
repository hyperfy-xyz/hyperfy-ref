# Hyperfy⚡️ - Explore and build the metaverse with others, instantly on the web.

## Local Development Setup Guide

This README will guide you through installing Node.js and Yarn (using your command line), cloning the repository, and spinning up the local development environments for both the **server** and **website** projects.

---

## Prerequisites

- **Git**: Make sure you have Git installed.  
  [Download Git here](https://git-scm.com/downloads).

- **Command line or terminal**: You will be using a shell like bash, zsh, or PowerShell.

---

## 1. Install Node.js (Latest Stable Version)

### macOS / Linux

1. **Download and install using `nvm` (Node Version Manager)**

   ```bash
   # If you don't have nvm installed, install it:
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
   source ~/.nvm/nvm.sh

   # Install the latest stable version of Node.js
   nvm install node

   # Verify Node.js is installed
   node --version
   ```

2. **Alternatively, download from [nodejs.org](https://nodejs.org/en) (LTS version).**

### Windows

1. **Install via the official Node.js Installer**  
   Go to [nodejs.org](https://nodejs.org/en/download/) and choose the LTS version for Windows.
2. **Verify Node.js is installed**  
   ```bash
   node --version
   ```

---

## 2. Install Yarn (Latest Stable Version)

Once Node.js is installed, you can install Yarn globally with:

```bash
npm install --global yarn
```

Verify installation:

```bash
yarn --version
```

---

## 3. Clone the Git Repository

1. Navigate to the directory where you want the project to live:
   ```bash
   cd path/to/your/projects/
   ```
2. Clone the repo (replace `<repo-url>` with the repository’s actual URL):
   ```bash
   git clone <repo-url>
   ```
3. Navigate into the newly cloned directory:
   ```bash
   cd <cloned-repository-name> # e.g., my-project
   ```

---

## 4. Install Dependencies and Start the Development Environments

This repository has two packages located in the `./packages/server` and `./packages/website` directories.

### 4.1 Server

1. Change directory into the server package:
   ```bash
   cd packages/server
   ```
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Start the server in development mode:
   ```bash
   yarn run dev
   ```

This will spin up your server, typically accessible via a local port (e.g., `http://localhost:3000` or whichever port is configured).

### 4.2 Website

In a separate terminal window or tab:

1. Navigate to the website package:
   ```bash
   cd packages/website
   ```
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Start the website in development mode:
   ```bash
   yarn run dev
   ```

This will spin up your local development environment for the website, typically on a different port (e.g., `http://localhost:3000` or whichever port is configured).

---

## 5. Verifying the Setup

- **Server**: Once running, you should see server logs indicating that it is listening on a specific port.  
- **Website**: Open the browser to the website’s local dev URL (e.g., `http://localhost:3000`) to see your project running in the browser.

---

## Additional Tips

- **Stopping the Dev Environment**: In each terminal running the server or website, press `Ctrl + C` to stop the process.
- **Re-running the Dev Environment**: Just repeat the `yarn run dev` command in the respective directory.
- **Working with Git**: Remember to commit your changes often, create branches when working on new features, and merge back when ready.

---

**That’s it!** You now have Node.js, Yarn, and the local dev environments for both server and website running on your machine. Happy coding!
