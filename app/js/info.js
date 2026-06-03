document.addEventListener("DOMContentLoaded", async () => {
    const appVersionContainer = document.getElementsByClassName("app-version")[0];
    // const appVersion = await eel.getAppVersion()();
    const appVersion = "v3.0.0-beta2";
    appVersionContainer.textContent = appVersion;
});