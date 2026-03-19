import baileysHelper from "baileys_helper";

export const sendButtons = baileysHelper?.sendButtons;
export const sendInteractiveMessage = baileysHelper?.sendInteractiveMessage;
export const interactiveHelperInfo =
  typeof baileysHelper?.getPackageInfo === "function" ? baileysHelper.getPackageInfo() : null;

export default baileysHelper;
