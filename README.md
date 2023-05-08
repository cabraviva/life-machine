<img alt="Life Machine" src="https://i.imgur.com/dcDC6mV.png">

# Why?
 Have you ever had a npm package which was basically done and needed no more support? If so, it's very likely your package has dependencies, which might have vulnerabilities and should therefore be kept up to date. Life Machine does that automatically for you, by integrating GitHub Actions, Dependabot and npm.

### Features
 - 🤖 Based on Dependabot
 - 🗄️No own server required
 - ✴️ Uses GitHub Actions
 - ⚙️ Easy setup
 - 🟪 Discord integration
 - ✅ Test code before publish
 - 👨🏻 Manual review on major version change

# Setup guide
## Step 1: Creating the workflow
 Go to your repository and run this command:
 ```sh
npx -y life-machine
 ```
 This will create a workflow file in the `.github/workflows` folder. It will also generate a config file in `.github/.life-machine.json`.
## Step 2: Setting up tokens
 To work, life machine will need two to three tokens:
 1. NPM Token
 2. GitHub Token (will be generated automatically)
 3. Discord Webhook URL (optional)
 
 You can set these secrets in your GitHub repo settings, under `Security/Secrets and Variables/Dependabot`, accessible under https://github.com/you/your-repo/settings/secrets/dependabot.

 First, create a npm access token as shown [here](https://scribehow.com/shared/How_to_Generate_an_NPM_Access_Token_for_Automation__ZY0B3TR6SM64JxJBvIUnZw). Then go to the repo settings, click **New repository secret**, and create one with the name `LM_NPM_TOKEN` and your generated token as the secret.
 Now you are technically done with secrets.

### Optional: Adding Discord notification support
 If you want to receive messages when you manually need to review something, or just want to know if a new version of your package was published, you can create an Discord WebHook to send messages for you.
 First, follow [this guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) and copy the generated WebHook URL. Go back to the repo settings and create a new secret with the name `LM_DISCORD_TOKEN` and use the WebHook URL as the secret.

# Configuring Life Machine
 If you take a look at the `.github/.life-machine.json` file, you'll find the configuration for Life Machine. It will look like this by default:
```json
{
    "manualCheckOnMajor": true,
    "runTests": true,
    "manualOnly": false,
    "testCommand": "npm test",
    "discordNotifications": {
        "onPublish": true,
        "onAttentionNeeded": true
    },
    "versionType": "patch"
}
```
 You can change this options based on your needs. Here is a little explanation for each:
 |Option|Explanation|Possible values|Recommended value| 
 |--|--|--|--|
 |manualCheckOnMajor|Defines wether Life Machine should publish the package, even if a dependency has a major version change|true\|false|true|
 |runTests|If set to true, Life Machine will only publish if the given test command exited with code 0|true\|false|true|
 |manualOnly|If set to true, Life Machine won't ever publish and will just send you a discord message when a dependency can be updated|true\|false|false|
 |discordNotifications.onPublish|Defines wether you want to receive a discord message when your package was published successfully|true\|false|true|
 |discordNotifications.onAttentionNeeded|Defines wether you want to receive a discord message when your package couldn't be published. It's recommended to never touch this|true\|false|true|
 |versionType|Defines what version type should be used to generate the version tag for your package|"major"\|"minor"\|"patch"|"patch"|
 |registry|A custom registry url, without protocol|string|"registry.npmjs.org"
 |rebaseTries|When Dependabot triggers multiple releases at a time (which happens most of the time), there's a good chance that the calculated version was already published for another package. To prevent this, you can set the number of tries to republish|number|5 (or number of your dependencies / what you can afford)|

# What to do when manual attention is needed
 If you receive a message saying your package wasn't published you should first check why:
## 1. Tests failed
 If your tests failed, this is either because you have a bad test command defined or the new version of the package doesn't integrate well with your code. Now you should do the following steps:
 1. Install the affected dependency version
 2. Run the tests on your local machine
 3. Solve the integration issues
 4. Run `npm version patch`
 5. Run `npm publish`
 6. Commit & Push to GitHub
## 2. A dependency received a major update or manualOnly is set to true
 If you receive this error message, there was no actual error, but Life Machine just wants to make sure your code really works with the new versions. You should do the following:
 1. Install the affected dependency version
 2. Make sure everything works fine
 3.  Run `npm version patch`
 4. Run `npm publish`
 5. Commit & Push to GitHub
## 3. An error occurred
 If an error occurred, try to read what went wrong from the error message, but this steps should help in general:
 1. Make sure your secrets are set correctly
 2. Make sure the config is valid
 3. Make sure the Discord WebHook url exists
 4. Make sure dependabot is set up correctly
 5. Make sure your NPM_SECRET is still valid

 If that doesn't help, [create an issue](https://github.com/greencoder001/life-machine/issues/new) to let me know about your problem!