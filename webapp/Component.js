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

			this.setModel(models.createDeviceModel(), "device");

			// Initialize global IRGP collection for mock multi-persona state tracking
			var oIRGPGlobalData = {
				documents: [
					{
						IRGPNo: "IRGP2026-27-0068",
						GEDate: "06-05-2026",
						DueDate: "13-05-2026",
						RevisedDueDate: "13-05-2026",
						ReturnedDate: "01-01-1900",
						Department: "MECHANICAL",
						RequestUser: "Sathish Panchatsaram",
						ReturnUser: "",
						ContractName: "POWER MECH PROJECTS LTD - LHP & AHP",
						ContractEmployeeName: "Sureshbabu",
						RequestType: "HxGN EAM",
						Remarks: "Material issue for Slag path work",
						StatusCode: "PENDING_RESERVATION", // User needs to enter MRN number
						items: [
							{
								SNo: 1,
								ItemCode: "7843200012",
								ItemDescription: "Alloy Steel Plate, Grade: 16MO3, ASTM",
								SentQuantity: "314",
								RecievedQuantity: "0",
								BalanceQuantity: "314",
								UOM: "Kilograms",
								MRNumber: "",
								Location: "NP1",
								Mp2ItemCode: "",
								DefaultBin: "PS - 08"
							}
						]
					},
					{
						IRGPNo: "IRGP2026-27-0045",
						GEDate: "04-05-2026",
						DueDate: "11-05-2026",
						RevisedDueDate: "11-05-2026",
						ReturnedDate: "01-01-1900",
						Department: "ELECTRICAL",
						RequestUser: "Muthuraman A",
						ReturnUser: "",
						ContractName: "POWER MECH PROJECTS LTD - Pressure parts",
						ContractEmployeeName: "SURESH",
						RequestType: "HxGN EAM",
						Remarks: "Emergency issue for cabling",
						StatusCode: "PENDING_RECEIPT", // Ready for store to return counts
						items: [
							{
								SNo: 1,
								ItemCode: "6055850018",
								ItemDescription: "Online AAQMS(Ambient Air Quality Monitoring S:",
								SentQuantity: "2",
								RecievedQuantity: "0",
								BalanceQuantity: "2",
								UOM: "Set",
								MRNumber: "MR-88123",
								Location: "NP1",
								Mp2ItemCode: "",
								DefaultBin: "-"
							}
						]
					}
				]
			};
			var oIRGPGlobalModel = new JSONModel(oIRGPGlobalData);
			this.setModel(oIRGPGlobalModel, "irgpGlobal");

			this.getRouter().initialize();
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