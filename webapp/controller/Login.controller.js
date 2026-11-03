sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zgpms.meilpower.com.controller.Login", {

        // 1. Starts automatically when the app loads
        onInit: function () {
            this.hello();
            this.authenticate();
        },

        hello: function () {
            console.log("onInit function is triggering");
        },

        // 2. Fetch logged-in user session from SAP
        authenticate: function () {
            var that = this;
            var oModel = new JSONModel();
            oModel.loadData("/sap/bc/ui2/start_up");

            oModel.attachRequestCompleted(function (oEvent) {
                var bSuccess = oEvent.getParameter("success");

                if (!bSuccess) {
                    MessageBox.error("Authentication failed. Please check your SAP connection.");
                    return;
                }

                var oUserData = oModel.getData();
                var sUserId = oUserData.id || "";
                console.log("Authenticated User ID:", sUserId);

                // Pass the user ID to the next step
                that.loadUserDetails(sUserId);
            });
        },

        // 3. Fetch plant, role, and department from SAP table via /ZUserdetSet
        loadUserDetails: function (userID) {
            var that = this;

            var oDataModel = this.getOwnerComponent().getModel();
            if (!oDataModel) {
                console.error("Failed to fetch the OData model");
                MessageBox.error("OData model not found");
                return;
            }

            var oUserFilter = new Filter("User", FilterOperator.EQ, userID);

            oDataModel.read("/ZUserdetSet", {
                filters: [ oUserFilter ],
                success: function (odata) {
                    console.log("OData fetched successfully:", odata);

                    // Pick first record safely
                    var userResults = (odata.results && odata.results[ 0 ]) || {};

                    var sRole = (userResults.Role || "").trim().toUpperCase();
                    var sDepartment = (userResults.Department || "").trim();
                    var sPlant = (userResults.Plant || "").trim();
                    var sFullName = (userResults.UserFullName || userResults.UserName || userID).trim();

                    console.log("user:", userID);
                    console.log("role:", sRole);
                    console.log("dept:", sDepartment);
                    console.log("plant:", sPlant);

                    // 4. Evaluate Roles (HOD, Store, or Requester)
                    var bIsHod = sRole.indexOf("HOD") !== -1 || sDepartment.toUpperCase().indexOf("HOD") !== -1;
                    var bIsStoreUser = sRole.indexOf("STORE") !== -1 || sDepartment.toUpperCase().indexOf("STORE") !== -1;
                    var bIsUserOnly = !bIsHod && !bIsStoreUser;

                    // 5. Store everything into the global "user" model so all screens can use it
                    var oUserModel = sap.ui.getCore().getModel("user");
                    if (!oUserModel) {
                        oUserModel = new JSONModel();
                        sap.ui.getCore().setModel(oUserModel, "user");
                        that.getOwnerComponent().setModel(oUserModel, "user");
                    }

                    oUserModel.setProperty("/id", userID);
                    oUserModel.setProperty("/fullName", sFullName);
                    oUserModel.setProperty("/Username", sFullName);
                    oUserModel.setProperty("/Plant", sPlant);
                    oUserModel.setProperty("/Department", sDepartment);
                    oUserModel.setProperty("/Role", sRole);
                    oUserModel.setProperty("/IsHodUser", bIsHod);
                    oUserModel.setProperty("/IsStoreUser", bIsStoreUser);
                    oUserModel.setProperty("/IsGatepassUserOnly", bIsUserOnly);

                    // Save to browser localStorage so it persists across reloads
                    localStorage.setItem("gpms_user", JSON.stringify(oUserModel.getData()));

                    // 6. Navigate to the Home dashboard!
                    that.navigateHome();
                },
                error: function (oError) {
                    console.error("Failed to read /ZUserdetSet:", oError);
                    // Even if user record is missing, allow navigating to Home
                    that.navigateHome();
                }
            });
        },

        // 7. Router navigation helper
        navigateHome: function () {
            console.log("Navigating to Home screen...");
            this.getRouter().navTo("home");
        }

    });
});