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

			// Pre-populate mock scrap requests and inventory if not present in localStorage
			if (!localStorage.getItem("mockScrapRequests")) {
				var aDefaultScrapRequests = [
					{
						requestDate: "2026-05-21T08:00:00.000Z",
						weighmentSlipNo: "",
						challanDateTime: "",
						vehicleDetails: "TN-15-AB-1234",
						collectArea: "Boiler Area",
						remarks: "Scrap metal pipes from maintenance",
						saleOrder: "310019793",
						vendor: "V1",
						vendorName: "Sri Manikandan Traders",
						vendorAddress: "Sri Manikandan Traders, No.102, Vridhachalam Main Road,, Neyveli, India, 607802",
						vendorGST: "33ABEFS1534J1ZB",
						city: "Neyveli",
						postalCode: "607802",
						items: [
							{
								sno: "1",
								type: "Metal",
								description: "MS Pipes",
								quantity: "150",
								uom: "KG"
							}
						],
						requestId: "REQ-1001",
						status: "Approved",
						requestDateStr: "21/05/2026"
					},
					{
						requestDate: "2026-05-22T08:00:00.000Z",
						weighmentSlipNo: "",
						challanDateTime: "",
						vehicleDetails: "TN-15-XY-5678",
						collectArea: "Electrical Yard",
						remarks: "Used lead batteries",
						saleOrder: "310019793",
						vendor: "V2",
						vendorName: "Metal Scrap Buyers Pvt Ltd",
						vendorAddress: "Metal Scrap Buyers Pvt Ltd, Chennai",
						vendorGST: "33XXXXXXXXXXXXX",
						city: "Chennai",
						postalCode: "600001",
						items: [
							{
								sno: "1",
								type: "Batteries",
								description: "Lead batteries",
								quantity: "5",
								uom: "MT"
							}
						],
						requestId: "REQ-1002",
						status: "Pending HOD",
						requestDateStr: "22/05/2026"
					}
				];
				localStorage.setItem("mockScrapRequests", JSON.stringify(aDefaultScrapRequests));
			}

			if (!localStorage.getItem("mockScrapInventory")) {
				var oDefaultInventory = {
					"Metal": { quantity: 150, uom: "KG" },
					"Rubber": { quantity: 50, uom: "KG" },
					"Oil": { quantity: 200, uom: "L" },
					"Plastic": { quantity: 80, uom: "KG" },
					"Copper": { quantity: 100, uom: "KG" },
					"Batteries": { quantity: 5, uom: "MT" }
				};
				localStorage.setItem("mockScrapInventory", JSON.stringify(oDefaultInventory));
			}

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
						oUserModel.setProperty("/IsGatepassUserOnly", sRole === "Z_MM_GATEPASS_USER_FRONT_VIEW");
						oUserModel.setProperty("/IsHodUser", sRole === "Z_MM_GATEPASS_HOD_FRONT_VIEW");
						oUserModel.setProperty("/IsStoreUser", sRole === "Z_MM_GATEPASS_STORE_FRONT_VIEW");
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