sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel"
], function (BaseController, Filter, FilterOperator, JSONModel) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.Analytics", {

		onInit: function () {
			this.getView().setModel(new JSONModel(this._emptyModel()), "analytics");
			this.getRouter().getRoute("analytics").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this.getView().getModel("analytics").setData(this._emptyModel());
			this._getData();
		},

		_emptyModel: function () {
			return {
				tiles: {
					total: 0, pending: 0, approved: 0, rejected: 0,
					nrgpTotal: 0, nrgpPending: 0, nrgpApproved: 0, nrgpRejected: 0,
					rgpTotal: 0, rgpPending: 0, rgpApproved: 0, rgpRejected: 0,
					outGatePass: 0, gateEntries: 0, gateEntriesInspected: 0, gateEntriesPendingInsp: 0,
					scrapRequests: 0, scrapReqApproved: 0, scrapReqPending: 0,
					scrapGatePasses: 0, ashGatePasses: 0
				},
				barData: [],
				pieData: [],
				allTypesBar: [],
				gateEntryPie: []
			};
		},

		_getData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var that = this;
			var oResult = {
				nrgpData: [], rgpData: [],
				outNrgp: [], outRgp: [], outPo: [],
				gateEntries: [], scrapRequests: [],
				scrapGP: [], ashGP: []
			};

			var iTotalCalls = 9;
			var iSettled = 0;
			sap.ui.core.BusyIndicator.show(0);

			function onSettle() {
				iSettled++;
				if (iSettled >= iTotalCalls) {
					sap.ui.core.BusyIndicator.hide();
					that._processData(oResult);
				}
			}

			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) { oResult.nrgpData = oData.results || []; onSettle(); },
				error: function () { onSettle(); }
			});

			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) { oResult.rgpData = oData.results || []; onSettle(); },
				error: function () { onSettle(); }
			});

			["NRGP", "RGP", "PO"].forEach(function (sType) {
				oODataModel.read("/OutGatePassSet", {
					filters: [new Filter("GatePassType", FilterOperator.EQ, sType)],
					success: function (oData) {
						var sKey = "out" + sType.charAt(0) + sType.slice(1).toLowerCase();
						oResult[sKey] = oData.results || [];
						onSettle();
					},
					error: function () { onSettle(); }
				});
			});

			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = (oUserModel && oUserModel.getProperty("/Plant")) || "";
			var aPcpFilters = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];
			oODataModel.read("/PCPHdrSet", {
				filters: aPcpFilters,
				success: function (oData) { oResult.gateEntries = oData.results || []; onSettle(); },
				error: function () { onSettle(); }
			});

			oODataModel.read("/ScrapReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				success: function (oData) { oResult.scrapRequests = oData.results || []; onSettle(); },
				error: function () { onSettle(); }
			});

			oODataModel.read("/ScrapPassHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				success: function (oData) { oResult.scrapGP = oData.results || []; onSettle(); },
				error: function () { onSettle(); }
			});

			oODataModel.read("/AshHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				success: function (oData) { oResult.ashGP = oData.results || []; onSettle(); },
				error: function () { onSettle(); }
			});
		},

		_classifyStatus: function (item) {
			var s = (item.ApprovalReq || item.Status || "").toString().trim().toUpperCase();
			if (s === "A" || s === "APPROVED") { return "Approved"; }
			if (s === "R" || s === "REJECTED") { return "Rejected"; }
			return "Pending";
		},

		_processData: function (oResult) {
			var that = this;

			var c = {
				nrgpPending: 0, nrgpApproved: 0, nrgpRejected: 0,
				rgpPending: 0, rgpApproved: 0, rgpRejected: 0
			};

			oResult.nrgpData.forEach(function (item) {
				var s = that._classifyStatus(item);
				if (s === "Pending") { c.nrgpPending++; }
				else if (s === "Approved") { c.nrgpApproved++; }
				else { c.nrgpRejected++; }
			});

			oResult.rgpData.forEach(function (item) {
				var s = that._classifyStatus(item);
				if (s === "Pending") { c.rgpPending++; }
				else if (s === "Approved") { c.rgpApproved++; }
				else { c.rgpRejected++; }
			});

			var iOutGatePass = oResult.outNrgp.length + oResult.outRgp.length + oResult.outPo.length;

			var iGateEntries = oResult.gateEntries.length;
			var iInspected = 0;
			var iPendingInsp = 0;
			oResult.gateEntries.forEach(function (item) {
				var sInsp = (item.InspectionStatus || "").trim().toLowerCase();
				if (sInsp === "completed" || sInsp === "done") { iInspected++; }
				else { iPendingInsp++; }
			});

			var iScrapReq = oResult.scrapRequests.length;
			var iScrapReqApproved = 0;
			var iScrapReqPending = 0;
			oResult.scrapRequests.forEach(function (item) {
				var s = that._classifyStatus(item);
				if (s === "Approved") { iScrapReqApproved++; }
				else { iScrapReqPending++; }
			});

			var iScrapGP = oResult.scrapGP.length;
			var iAshGP = oResult.ashGP.length;

			var iTotalRequests = oResult.nrgpData.length + oResult.rgpData.length;

			var oModel = this.getView().getModel("analytics");
			oModel.setData({
				tiles: {
					total: iTotalRequests,
					pending: c.nrgpPending + c.rgpPending,
					approved: c.nrgpApproved + c.rgpApproved,
					rejected: c.nrgpRejected + c.rgpRejected,
					nrgpTotal: oResult.nrgpData.length,
					nrgpPending: c.nrgpPending, nrgpApproved: c.nrgpApproved, nrgpRejected: c.nrgpRejected,
					rgpTotal: oResult.rgpData.length,
					rgpPending: c.rgpPending, rgpApproved: c.rgpApproved, rgpRejected: c.rgpRejected,
					outGatePass: iOutGatePass,
					gateEntries: iGateEntries,
					gateEntriesInspected: iInspected,
					gateEntriesPendingInsp: iPendingInsp,
					scrapRequests: iScrapReq,
					scrapReqApproved: iScrapReqApproved,
					scrapReqPending: iScrapReqPending,
					scrapGatePasses: iScrapGP,
					ashGatePasses: iAshGP
				},
				barData: [
					{ status: "Pending", nrgp: c.nrgpPending, rgp: c.rgpPending },
					{ status: "Approved", nrgp: c.nrgpApproved, rgp: c.rgpApproved },
					{ status: "Rejected", nrgp: c.nrgpRejected, rgp: c.rgpRejected }
				],
				pieData: [
					{ status: "Pending", count: c.nrgpPending + c.rgpPending },
					{ status: "Approved", count: c.nrgpApproved + c.rgpApproved },
					{ status: "Rejected", count: c.nrgpRejected + c.rgpRejected }
				],
				allTypesBar: [
					{ type: "NRGP Requests", count: oResult.nrgpData.length },
					{ type: "RGP Requests", count: oResult.rgpData.length },
					{ type: "Out Gate Pass", count: iOutGatePass },
					{ type: "Gate Entries", count: iGateEntries },
					{ type: "Scrap Requests", count: iScrapReq },
					{ type: "Scrap Gate Pass", count: iScrapGP },
					{ type: "Ash Gate Pass", count: iAshGP }
				],
				gateEntryPie: [
					{ status: "Inspected", count: iInspected },
					{ status: "Pending Inspection", count: iPendingInsp }
				]
			});

			this._applyChartProperties();
		},

		_applyChartProperties: function () {
			var oBar = this.byId("idBarChart");
			if (oBar) {
				oBar.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					plotArea: {
						colorPalette: ["#6A1B9A", "#00695C"],
						dataLabel: { visible: true, formatString: "0" }
					},
					categoryAxis: { title: { visible: false } },
					valueAxis: { title: { visible: false } }
				});
			}

			var oDonut = this.byId("idDonutChart");
			if (oDonut) {
				oDonut.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					plotArea: {
						colorPalette: ["#E65100", "#1B6B3A", "#CC2020"],
						dataLabel: { visible: true, type: "percentage", formatString: "0%" }
					}
				});
			}

			var oAllTypes = this.byId("idAllTypesChart");
			if (oAllTypes) {
				oAllTypes.setVizProperties({
					title: { visible: false },
					legend: { visible: false },
					plotArea: {
						colorPalette: ["#6A1B9A", "#00695C", "#1A237E", "#0277BD", "#E65100", "#795548", "#424242"],
						dataLabel: { visible: true, formatString: "0" }
					},
					categoryAxis: { title: { visible: false } },
					valueAxis: { title: { visible: false } }
				});
			}

			var oGePie = this.byId("idGateEntryPieChart");
			if (oGePie) {
				oGePie.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					plotArea: {
						colorPalette: ["#1B6B3A", "#E65100"],
						dataLabel: { visible: true, type: "percentage", formatString: "0%" }
					}
				});
			}
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		}

	});
});
