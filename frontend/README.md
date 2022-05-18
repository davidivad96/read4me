# Frontend for the ReadForMe backend

Simple web app where you can upload a document with text (supported formats: PDF, JPG and JPEG) and this will be converted to speech and reproduced in your browser.

## Environment variables needed

There is a `.env.example` file in the root of the project. Copy it to `.env` and fill in the values to use the app:

```
REACT_APP_BUCKET_NAME=
REACT_APP_AWS_REGION=
REACT_APP_AWS_ACCESS_KEY_ID=
REACT_APP_AWS_SECRET_ACCESS_KEY=
```

You need to have deployed the ReadForMe CDK Stack first (also available in this repository, read its README.md to know how to deploy it). After that you can fill the env variables and run the app.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run serve`

Serves the production bundle built with the `npm run build` command.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.
