sap.ui.define([
	"sap/ui/core/UIComponent",
	"./model/models",
	"sap/ui/core/routing/History",
	"sap/ui/Device",
	"sap/ui/model/resource/ResourceModel",
	"sap/ui/model/json/JSONModel"
], function(UIComponent, models, History, Device, ResourceModel, JSONModel) {
	"use strict";

	return UIComponent.extend("zgpms.meilpower.com.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		init: function () {
			UIComponent.prototype.init.apply(this, arguments);

			// Initialize global user model
			var oUserModel = new JSONModel({
				IsGatepassUserOnly: false,
				IsHodUser: false,
				IsStoreUser: false
			});
			sap.ui.getCore().setModel(oUserModel, "user");
			this.setModel(oUserModel, "user");

			// Restore user session from localStorage
			var sSavedUser = localStorage.getItem("gpms_user");
			if (sSavedUser) {
				try {
					var oUserData = JSON.parse(sSavedUser);
					oUserModel.setData(oUserData);
					
					// Asynchronously refresh user details from backend to update roles
					if (oUserData.id) {
						this._refreshUserDetails(oUserData.id);
					}
				} catch (e) {
					console.error("Error restoring user session:", e);
				}
			}

			this.setModel(models.createDeviceModel(), "device");

			// Initialize global IRGP collection for multi-persona state tracking (start empty)
			var oIRGPGlobalData = {
				documents: []
			};
			var oIRGPGlobalModel = new JSONModel(oIRGPGlobalData);
			this.setModel(oIRGPGlobalModel, "irgpGlobal");

			this.getRouter().initialize();
		},

		_refreshUserDetails: function (sUserId) {
			var oODataModel = this.getModel();
			if (!oODataModel) {
				return;
			}
			var oUserModel = this.getModel("user");
			oODataModel.read("/ZUserdetSet", {
				filters: [new sap.ui.model.Filter("User", sap.ui.model.FilterOperator.EQ, sUserId)],
				success: function (oData) {
					var oResult = (oData.results && oData.results[0]) || {};
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
				}.bind(this),
				error: function (oError) {
					console.error("Error refreshing user details:", oError);
				}
			});
		},

		myNavBack: function () {
			var oHistory = History.getInstance();
			var oPrevHash = oHistory.getPreviousHash();
			if (oPrevHash !== undefined) {
				window.history.go(-1);
			} else {
				this.getRouter().navTo("masterSettings", {}, true);
			}
		},

		getContentDensityClass: function () {
			if (!this._sContentDensityClass) {
				if (!Device.support.touch){
					this._sContentDensityClass = "sapUiSizeCompact";
				} else {
					this._sContentDensityClass = "sapUiSizeCozy";
				}
			}
			return this._sContentDensityClass;
		}
	});
});