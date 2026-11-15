# Ubuntu demonstration package

## Overview

The Ubuntu demonstration package is distributed separately through the
[GitHub Releases](https://github.com/Nutrascore/nutrascore/releases) page. It
allows examiners to run NutraScore without setting up the development
environment or installing the project dependencies manually.

## Requirements

- Ubuntu, or Ubuntu running through WSL 2
- Node.js available as `node` on the system
- A web browser

The package includes the compiled application, its runtime dependencies, and a
copy of the SQLite database. Node.js itself is not included.

## Download

Download `NutraScore-Demo-Ubuntu.zip` from the repository's
[GitHub Releases](https://github.com/Nutrascore/nutrascore/releases) page.

## Extract the package

On Ubuntu, extract the archive into a directory:

```sh
mkdir -p ~/nutrascore-demo
unzip ~/Downloads/NutraScore-Demo-Ubuntu.zip -d ~/nutrascore-demo
```

When using WSL with the archive in the Windows Downloads directory, use the
mounted Windows path. Replace `<WindowsUser>` with the Windows user name:

```sh
mkdir -p ~/nutrascore-demo
unzip /mnt/c/Users/<WindowsUser>/Downloads/NutraScore-Demo-Ubuntu.zip \
  -d ~/nutrascore-demo
```

## Run the application

Navigate into the extracted package directory and start it:

```sh
cd ~/nutrascore-demo
bash start.sh
```

The startup script starts the compiled API from `api/dist` and the compiled
frontend from `web/.svelte-kit/output`. It uses the bundled database at
`api/nutrascore.sqlite`. The default API port is `3000` and the default
frontend port is `5173`.

## Access the application

Open the frontend in a browser:

<http://127.0.0.1:5173>

The API health endpoint is:

<http://127.0.0.1:3000/api/health>

## Stop the application

Return to the terminal running `start.sh` and press `Ctrl+C`. The script stops
both the API and frontend processes before exiting.

## Notes

- The demonstration package uses the bundled SQLite database and does not
  require PostgreSQL.
- The package is intended for local demonstration use. The API and frontend
  are started on local ports and are not configured as a production service.
- The package contains the built application and runtime dependencies, so an
  internet connection is not required after Node.js and the archive are
  available.
