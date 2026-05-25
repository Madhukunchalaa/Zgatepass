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