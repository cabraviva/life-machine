#! /usr/bin/env node
const fs = require('fs-extra')
const path = require('path')

if (process.argv[1] === '@workflow') {
    // Inside of an workflow
    const NPM_TOKEN = process.argsv[2]
    const SLACK_TOKEN = process.argsv[3] || null
    console.log('Detected workflow - Starting Life Machine')
    console.log('NPM Token length:', NPM_TOKEN.length)
    console.log('SLACK Token provided:', SLACK_TOKEN === null ? 'no' : 'yes, length: ' + SLACK_TOKEN.length)
    process.exit(0)
} else {
    // Setup
    fs.ensureDirSync(path.join(process.cwd(), '.github', 'workflows'))
    fs.writeFileSync(path.join(process.cwd(), '.github', '.life-machine.json'), JSON.stringify({
        manualCheckOnMajor: true,
        runTests: true,
        manualOnly: false,
        testCommand: 'npm test',
        slackNotifications: {
            onPublish: true,
            onAttentionNeeded: true
        },
        versionType: 'patch'
    }, null, 4))
    fs.writeFileSync((path.join(process.cwd(), '.github', 'workflows', 'life-machine.yml')), `name: Life Machine

on:
  pull_request:
    branches: [ main, master ]

jobs:
  publish:

    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x]
        # See supported Node.js release schedule at https://nodejs.org/en/about/releases/

    steps:
    - uses: actions/checkout@v2
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v2
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    # Installs npm packages
    - run: npm ci
    # Runs Life Machine
    - run: npx -y life-machine @workflow \${{ secrets.LM_NPM_TOKEN }} \${{ secrets.LM_SLACK_TOKEN }}
`)
}