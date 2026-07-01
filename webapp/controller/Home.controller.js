sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.Home", {

		onInit: function () {
			this.getView().setModel(new JSONModel({
				gatePassListCount: "-",
				nrgpListCount: "-",
				scrapGpListCount: "-",
				ashGpListCount: "-"
			}), "hodCounts");

			this.getRouter().getRoute("home").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadPendingCounts();
		},

		_loadPendingCounts: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var oCountsModel = this.getView().getModel("hodCounts");

			// Track all 8 parallel calls — BusyIndicator hides only when every call settles
			var iTotalCalls = 8;
			var iSettled = 0;
			sap.ui.core.BusyIndicator.show(0);
			var fnSettle = function () {
				iSettled++;
				if (iSettled >= iTotalCalls) {
					sap.ui.core.BusyIndicator.hide();
				}
			};

			// Gate Pass Request List — backend requires GatePassType filter; count pending client-side
			var iReqPending = 0;
			var iReqDone = 0;
			["NRGP", "RGP", "PO"].forEach(function (sType) {
				oODataModel.read("/GateReqHdrSet", {
					filters: [
						new Filter("GatePassType", FilterOperator.EQ, sType),
						new Filter("Status", FilterOperator.EQ, "All")
					],
					success: function (oData) {
						var aResults = oData.results || [];
						iReqPending += aResults.filter(function (item) {
							var fnGetProp = function (obj, sProp) {
								if (!obj) return "";
								var sTarget = sProp.toLowerCase();
								for (var key in obj) {
									if (key.toLowerCase() === sTarget) {
										return obj[key];
									}
								}
								return "";
							};
							var s = fnGetProp(item, "ApprovalReq") || fnGetProp(item, "Status") || "";
							s = String(s).trim().toUpperCase();
							return s !== "A" && s !== "APPROVED" &&
								   s !== "R" && s !== "REJECTED" &&
								   s !== "AM" && s !== "AMENDMENT";
						}).length;
						iReqDone++;
						if (iReqDone === 3) {
							oCountsModel.setProperty("/gatePassListCount", iReqPending);
						}
						fnSettle();
					},
					error: function () { fnSettle(); }
				});
			});

			// Gate Pass List — sum NRGP + RGP + PO (backend requires GatePassType filter)
			var iGPCount = 0;
			var iGPDone = 0;
			["NRGP", "RGP", "PO"].forEach(function (sType) {
				oODataModel.read("/OutGatePassSet", {
					filters: [new Filter("GatePassType", FilterOperator.EQ, sType)],
					success: function (oData) {
						iGPCount += (oData.results || []).length;
						iGPDone++;
						if (iGPDone === 3) {
							oCountsModel.setProperty("/nrgpListCount", iGPCount);
						}
						fnSettle();
					},
					error: function () { fnSettle(); }
				});
			});

			// Scrap Gatepass List — total scrap gate passes
			oODataModel.read("/ScrapPassHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				success: function (oData) {
					oCountsModel.setProperty("/scrapGpListCount", (oData.results || []).length);
					fnSettle();
				},
				error: function () { fnSettle(); }
			});

			// Ash GP List — total ash gate passes
			oODataModel.read("/AshHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				success: function (oData) {
					oCountsModel.setProperty("/ashGpListCount", (oData.results || []).length);
					fnSettle();
				},
				error: function () { fnSettle(); }
			});
		},

		onPressNRGP: function () {
			this.getRouter().navTo("GatePassCreation", { type: "NRGP" });
		},

		onPressRGP: function () {
			this.getRouter().navTo("GatePassCreation", { type: "RGP" });
		},

		onPressInward: function () {
			this.getRouter().navTo("InwardGatePass");
		},

		onPressAddInwardInsurance: function () {
			this.getRouter().navTo("AddInwardInsurance");
		},

		onPressInwardInsuranceList: function () {
			this.getRouter().navTo("InwardInsuranceList");
		},

		onPressOutGatePass: function () {
			this.getRouter().navTo("OutGatePass");
		},

		onGenericTileAnalyticsPress: function () {
			this.getRouter().navTo("analytics");
		},

		onGenericTileExcelReportsPress: function () {
			this.getRouter().navTo("reports");
		},

		onPressNRGPList: function () {
			this.getRouter().navTo("NRGPList");
		},

		onGenericTileGatePassListPress: function () {
			this.getRouter().navTo("GatePassList");
		},

		onGenericTileGatePassWithPOPress: function () {
			this.getRouter().navTo("GatePassWithPO");
		},

		onPressPOList: function () {
			this.getRouter().navTo("POList");
		},

		onPressIRGP: function () {
			this.getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
		},

		onPressAddPCP: function () {
			this.getRouter().navTo("PCPList");
		},

		onPressAshGatePassCreation: function () {
			this.getRouter().navTo("AshGatePassCreation");
		},

		onPressAshGatePassRequest: function () {
			this.getRouter().navTo("AshGatePassRequest");
		},

		onPressAshGatePassRequestList: function () {
			this.getRouter().navTo("AshGatePassRequestList");
		},

		onPressAshGatePassList: function () {
			this.getRouter().navTo("AshGatePassList");
		},

		onPressScrapRequestCreation: function () {
			this.getRouter().navTo("ScrapRequestCreation");
		},

		onPressScrapRequestList: function () {
			this.getRouter().navTo("ScrapRequestList");
		},

		onPressScrapGatepassCreation: function () {
			this.getRouter().navTo("ScrapGatepassCreation");
		},

		onPressScrapGatepassList: function () {
			this.getRouter().navTo("ScrapGatepassList");
		},

		onPressScrapInventory: function () {
			this.getRouter().navTo("ScrapInventory");
		},

		onPressPCPManageList: function () {
			this.getRouter().navTo("PCPManageList");
		},

		onPressInspectionList: function () {
			this.getRouter().navTo("InspectionList");
		}

	});
});

