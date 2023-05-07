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

function runCmd(cmd, args = [], isTestCmd = false, pkgName = '', env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            env: {...process.env, ...env},
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

function updatePackageJsonWithPackageLockJson() {
    // Read package-lock.json file
    const packageLockData = fs.readFileSync('package-lock.json');
    const packageLockJson = JSON.parse(packageLockData);

    // Read package.json file
    const packageData = fs.readFileSync('package.json');
    const packageJson = JSON.parse(packageData);

    // Loop through dependencies and devDependencies in package.json
    ['dependencies', 'devDependencies'].forEach((dependencyType) => {
        if (packageJson[dependencyType]) {
            Object.keys(packageJson[dependencyType]).forEach((packageName) => {
                const packageVersion = packageJson[dependencyType][packageName];
                // Check if package is listed in package-lock.json
                const lockPkg = packageLockJson.packages[packageName] || packageLockJson.packages['node_modules/' + packageName]
                if (lockPkg) {
                    // Get the package version from package-lock.json
                    const lockFileVersion = lockPkg.version;
                    // Check if the package version in package.json is a string or an object
                    if (typeof packageVersion === 'string') {
                        // Update version with ^ prefix
                        packageJson[dependencyType][packageName] = `^${lockFileVersion}`;
                    } else {
                        // Update the version property of the package object with ^ prefix
                        packageJson[dependencyType][packageName].version = `^${lockFileVersion}`;
                    }
                }
            });
        }
    });

    // Write updated package.json back to file
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
}

function retrieveSemVer(oldV, type) {
    const parts = oldV.split('.')
    if (type === 'patch') {
        parts[2] = (parseInt(parts[2]) + 1).toString()
    } else if (type === 'minor') {
        parts[2] = '0'
        parts[1] = (parseInt(parts[1]) + 1).toString()
    } else if (type === 'major') {
        parts[2] = '0'
        parts[1] = '0'
        parts[0] = (parseInt(parts[0]) + 1).toString()
    }
    return parts.join('.')
}

function updateVersion (type) {
    // Read package-lock.json file
    const packageLockData = fs.readFileSync('package-lock.json');
    const packageLockJson = JSON.parse(packageLockData);

    // Read package.json file
    const packageData = fs.readFileSync('package.json');
    const packageJson = JSON.parse(packageData);

    const v = retrieveSemVer(packageJson.version, type)
    console.log('Next semver:', v)

    packageJson.version = v
    packageLockJson.version = v
    packageLockJson.packages[''].version = v

    // Write updated package.json back to file
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

    // Write updated package-lock.json back to file
    fs.writeFileSync('package-lock.json', JSON.stringify(packageLockJson, null, 2));
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
        if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) throwError('package.json must exist in cwd')
        const oldPkgJson = fs.readJSONSync(path.join(process.cwd(), 'package.json'))
        updatePackageJsonWithPackageLockJson()
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
            if (typeof oldPkgJson.dependencies !== 'object') oldPkgJson.dependencies = {}
            if (typeof oldPkgJson.devDependencies !== 'object') oldPkgJson.devDependencies = {}
            const sharedDeps = {
                ...oldPkgJson.dependencies,
                ...oldPkgJson.devDependencies
            }
            // Get latest pkgJson
            const latestPkgJson = pkgJson
            if (typeof latestPkgJson.dependencies !== 'object') latestPkgJson.dependencies = {}
            if (typeof latestPkgJson.devDependencies !== 'object') latestPkgJson.devDependencies = {}
            const latestSharedDeps = {
                ...latestPkgJson.dependencies,
                ...latestPkgJson.devDependencies
            }

            for (const [lName, lVersion] of Object.entries(sharedDeps)) {
                for (const [oName, oVersion] of Object.entries(latestSharedDeps)) {
                    if (lName === oName) {
                        if (lVersion === oVersion) {
                            console.log(`⚕️ ${lName}: Unchanged ${lVersion} - ${oVersion}`)
                            break
                        } else {
                            if (lVersion.startsWith('^')) lVersion = lVersion.substring(1)
                            if (oVersion.startsWith('^')) oVersion = oVersion.substring(1)
                            const lMajor = lVersion.split('.')[0]
                            const oMajor = oVersion.split('.')[0]
                            if (lMajor === oMajor) {
                                console.log(`⚕️ ${lName}: Minor / Patch ${lVersion} - ${oVersion}`)
                            } else {
                                console.log(`⚕️ ${lName}: Major ${lVersion} - ${oVersion}`)
                                await throwError('Did not update package ' + pkgJson.name + ', because package ' + lName + ' needs a major update and manualCheckOnMajor is set to true!')
                            }
                        }
                    }
                }
            }
        }
        

        console.log('Current: v' + pkgJson.version)
        updateVersion(config.versionType || 'patch')

        // Get new version
        const versionForPublish = fs.readJSONSync(path.join(process.cwd(), 'package.json')).version
        console.log('Will publish: v' + versionForPublish)

        // PR will be merged in workflow

        // Publish package
        try {
            fs.writeFileSync(path.join(process.cwd(), '.npmrc'), '//registry.npmjs.org/:_authToken=${NPM_TOKEN}')
            await runCmd('npm', ['publish'], false, pkgJson.name, {
                NPM_TOKEN
            })
            fs.removeSync(path.join(process.cwd(), '.npmrc'))
        } catch (err) {
            throwError(`Failed to publish package ${pkgJson.name}, because npm publish command failed. This is probably because your NPM_TOKEN is invalid. Error Message: ${err}`)
        }

        if (config.discordNotifications.onPublish) await sendDiscordMsg('✅ Successfully published package ' + pkgJson.name + '@' + versionForPublish + '!')
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

permissions:
  pull-requests: write

jobs:
  publish:
    if: \${{ github.actor == 'dependabot[bot]' }}
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
    - name: Dependabot metadata
      id: metadata
      uses: dependabot/fetch-metadata@v1
      with:
        github-token: "\${{ secrets.GITHUB_TOKEN }}"
      if: \${{ success() }}
    - name: Merge the PR
      run: gh pr merge \${{ github.event.pull_request.number }} --auto --squash --merge-message "Merged by workflow"
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      if: \${{ success() }}
`)
    if (!fs.existsSync(path.join(process.cwd(), '.github', 'dependabot.yml'))) fs.writeFileSync(path.join(process.cwd(), '.github', 'dependabot.yml'), `# To get started with Dependabot version updates, you'll need to specify which
# package ecosystems to update and where the package manifests are located.
# Please see the documentation for all configuration options:
# https://docs.github.com/github/administering-a-repository/configuration-options-for-dependency-updates

version: 2
updates:
  - package-ecosystem: "npm" # See documentation for possible values
    directory: "/" # Location of package manifests
    schedule:
      interval: "daily"`)
    console.log('✅ Sucessfully initialized Life Machine')
    console.log('Just make sure Dependabot is enabled and your secrets are defined!')
}