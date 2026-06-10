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
					oUserData.IsGatepassUserOnly = false;
					
					var oUserModel = sap.ui.getCore().getModel("user");
					if (!oUserModel) {
						oUserModel = new JSONModel();
						sap.ui.getCore().setModel(oUserModel, "user");
						this.getOwnerComponent().setModel(oUserModel, "user");
					}
					oUserModel.setData(oUserData);
					
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
                    var oUserModel = sap.ui.getCore().getModel("user");
                    if (oUserModel) {
                        var sRole = (oResult.Role || "").trim().toUpperCase();
                        oUserModel.setProperty("/Plant", oResult.Plant || "");
                        oUserModel.setProperty("/Cocode", oResult.Cocode || "");
                        oUserModel.setProperty("/Department", oResult.Department || "");
                        oUserModel.setProperty("/Role", sRole);
                        oUserModel.setProperty("/IsGatepassUserOnly", sRole === "ZC_MM_GATEPASS_USER_FRONT_VIEW");
                        oUserModel.setProperty("/IsHodUser", sRole === "ZC_MM_GATEPASS_HOD_FRONT_VIEW");
                        oUserModel.setProperty("/IsStoreUser", sRole === "ZC_MM_GATEPASS_STORE_FRONTVIEW");
                        localStorage.setItem("gpms_user", JSON.stringify(oUserModel.getData()));
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
