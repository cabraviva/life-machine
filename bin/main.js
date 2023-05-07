#! /usr/bin/env node
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
let config = {}

async function sendDiscordMsg (msg) {
    if ((process.argv[5] || null) === null) throw 'Error: Can\'t send a discord message without discord webhook url!'
    await axios.post(process.argv[5], {
        content: msg,
        username: "Life Machine",
        avatar_url: "https://i.imgur.com/FuVPVzi.jpeg"
    })
}

async function throwError (errMsg) {
    errMsg = `[❌ ERROR] ${errMsg}`
    console.log(errMsg)
    if (typeof config.discordNotifications === 'object' && config.discordNotifications.onAttentionNeeded === true) {
        await sendDiscordMsg(errMsg + ' @everyone')
    }
    process.exit(1)
}

const { spawn } = require('child_process');

function runCmd(cmd, args = [], isTestCmd = false, pkgName = '') {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            env: process.env,
            shell: true
        });

        child.stdout.on('data', (data) => {
            console.log(data.toString());
        });

        child.stderr.on('data', (data) => {
            console.error(data.toString());
        });

        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                if (!isTestCmd) {
                    throwError(`Command ${cmd} ${args.join(' ')} exited with code ${code}`);  
                } else {
                    throwError(`Did not publish package ${pkgName}, because the tests failed`)
                }
            }
        });

        child.on('error', (err) => {
            if (!isTestCmd) throwError(`Could not spawn command: ${cmd} ${args.join(' ')}: ${err}`);
        });
    });
}

if (process.argv[2] === '?workflow') {
    // Inside of an workflow
    const NPM_TOKEN = !process.argv[3] ? '' : process.argv[3].toString()
    const GITHUB_TOKEN = !process.argv[4] ? '' : process.argv[4].toString()
    const DISCORD_TOKEN = process.argv[5] || null
    console.log('Detected workflow - Starting Life Machine')
    console.log('NPM Token length:', NPM_TOKEN.length)
    console.log('GITHUB Token length:', GITHUB_TOKEN.length)
    console.log('DISCORD Token provided:', DISCORD_TOKEN === null ? 'no' : 'yes, length: ' + DISCORD_TOKEN.length)
    
    if (fs.existsSync(path.join(process.cwd(), '.github', '.life-machine.json'))) {
        config = fs.readJsonSync(path.join(process.cwd(), '.github', '.life-machine.json'))
    } else {
        throwError('Make sure that the file ' + path.join(process.cwd(), '.github', '.life-machine.json') + ' exists!')
    }

    if (NPM_TOKEN.length === 0) throwError('NPM_TOKEN can\'t be empty')
    if (GITHUB_TOKEN.length === 0) throwError('GITHUB_TOKEN can\'t be empty')
    
    ;(async () => {
        const { npmPublish } = await import('@jsdevtools/npm-publish')
        if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) throwError('package.json must exist in cwd')
        const pkgJson = fs.readJSONSync(path.join(process.cwd(), 'package.json'))

        if (config.manualOnly) {
            await sendDiscordMsg(`:warning: @everyone Package ${pkgJson.name} has new dependency updates available! Didn't publish because manualOnly is set to true!`)
            console.log('[❌ ERROR] Did not publish because manualOnly is set to true')
            process.exit(1)
        }

        if (config.runTests && typeof config.testCommand === 'string') {
            await runCmd(config.testCommand.split(' ')[0], config.testCommand.split(' ').slice(1), true, pkgJson.name)
        }

        if (config.manualCheckOnMajor) {
            if (typeof pkgJson.dependencies !== 'object') pkgJson.dependencies = {}
            if (typeof pkgJson.devDependencies !== 'object') pkgJson.devDependencies = {}
            const sharedDeps = {
                ...pkgJson.dependencies,
                ...pkgJson.devDependencies
            }
            // Get latest pkgJson from npm
            const res = await axios.get('https://registry.npmjs.org/' + pkgJson.name)
            const latestPkgJson = res.data.versions[res.data['dist-tags'].latest]
            if (typeof latestPkgJson.dependencies !== 'object') latestPkgJson.dependencies = {}
            if (typeof latestPkgJson.devDependencies !== 'object') latestPkgJson.devDependencies = {}
            const latestSharedDeps = {
                ...pkgJson.dependencies,
                ...pkgJson.devDependencies
            }

            for (const [lName, lVersion] of Object.entries(sharedDeps)) {
                for (const [oName, oVersion] of Object.entries(latestSharedDeps)) {
                    if (lName === oName) {
                        if (lVersion === oVersion) {
                            console.log(`⚕️ ${lName}: Unchanged`)
                            break
                        } else {
                            if (lVersion.startsWith('^')) lVersion = lVersion.substring(1)
                            if (oVersion.startsWith('^')) oVersion = oVersion.substring(1)
                            const lMajor = lVersion.split('.')[0]
                            const oMajor = oVersion.split('.')[0]
                            if (lMajor === oMajor) {
                                console.log(`⚕️ ${lName}: Minor / Patch`)
                            } else {
                                console.log(`⚕️ ${lName}: Major`)
                                await throwError('Did not update package ' + pkgJson.name + ', because package ' + lName + ' needs a major update and manualCheckOnMajor is set to true!')
                            }
                        }
                    }
                }
            }
        }

        await runCmd('npm', ['version', config.versionType || 'patch'])

        // Get new version
        const versionForPublish = fs.readJSONSync(path.join(process.cwd(), 'package.json')).version

        // PR will be merged in workflow

        // Publish package
        

        if (config.discordNotifications.onPublish) await sendDiscordMsg('✅ Successfully published package ' + pkgJson.name + '@' + versionForPublish + + '!')
        console.log('✅ Successfully published package ' + pkgJson.name + '@' + versionForPublish + '!')
        process.exit(0)
    })();
} else {
    // Setup
    fs.ensureDirSync(path.join(process.cwd(), '.github', 'workflows'))
    fs.writeFileSync(path.join(process.cwd(), '.github', '.life-machine.json'), JSON.stringify({
        manualCheckOnMajor: true,
        runTests: true,
        manualOnly: false,
        testCommand: 'npm test',
        discordNotifications: {
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
    - run: npx -y life-machine ?workflow \${{ secrets.LM_NPM_TOKEN }} \${{ secrets.GITHUB_TOKEN }} \${{ secrets.LM_DISCORD_TOKEN }}
      if: \${{ success() }}
    # Merge PR
    - name: Merge Pull Request
      uses: peter-evans/merge-pull-request@v3
      with:
        github-token: \${{ secrets.GITHUB_TOKEN }}
        merge-method: 'squash'
        delete-branch: true
      if: \${{ success() }}
`)
    console.log('✅ Sucessfully initialized Life Machine')
    console.log('Just make sure Dependabot is enabled and your secrets are defined!')
}