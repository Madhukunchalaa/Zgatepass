sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zgpms.meilpower.com.controller.Login", {

        onInit: function () {
            this._authenticate();
        },

        _authenticate: function () {
            var oModel = new JSONModel();
            oModel.loadData("/sap/bc/ui2/start_up");
            oModel.attachRequestCompleted(function (oEvent) {
                if (oEvent.getParameter("success")) {
                    var oUserData = oEvent.getSource().getData();
                    sap.ui.getCore().setModel(new JSONModel(oUserData), "user");
                    var sUserId = oUserData.id || "";
                    this._loadUserDetails(sUserId);
                } else {
                    MessageBox.error(
                        "Authentication failed. Please reload the page and try again.",
                        { title: "Sign In Failed" }
                    );
                }
            }.bind(this));
        },

        _loadUserDetails: function (sUserId) {
            var fnNavigate = function () {
                this.getRouter().navTo("home");
            }.bind(this);

            var oODataModel = this.getOwnerComponent().getModel();
            if (!oODataModel || !sUserId) {
                fnNavigate();
                return;
            }

            oODataModel.read("/ZUserdetSet", {
                filters: [new Filter("User", FilterOperator.EQ, sUserId)],
                success: function (oData) {
                    var oResult = (oData.results && oData.results[0]) || {};
                    console.log("=== User Authorization Details ===");
                    console.log("User ID:", sUserId);
                    console.log("Plant:", oResult.Plant);
                    console.log("Company Code:", oResult.Cocode);
                    console.log("Department:", oResult.Department);
                    console.log("Role:", oResult.Role);
                    console.log("=================================");

                    var oUserModel = sap.ui.getCore().getModel("user");
                    if (oUserModel) {
                        oUserModel.setProperty("/Plant", oResult.Plant || "");
                        oUserModel.setProperty("/Cocode", oResult.Cocode || "");
                        oUserModel.setProperty("/Department", oResult.Department || "");
                        oUserModel.setProperty("/Role", oResult.Role || "");
                    }
                    fnNavigate();
                },
                error: function (oError) {
                    console.error("[ZUserdetSet] Error:", oError.statusCode, oError.responseText);
                    fnNavigate();
                }
            });
        }

    });
});
