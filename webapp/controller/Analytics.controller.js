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
			this._getData();
		},

		_emptyModel: function () {
			return {
				tiles: {
					total: 0, pending: 0, approved: 0, rejected: 0,
					nrgpTotal: 0, nrgpPending: 0, nrgpApproved: 0, nrgpRejected: 0,
					rgpTotal: 0,  rgpPending: 0,  rgpApproved: 0,  rgpRejected: 0
				},
				barData: [],
				pieData: []
			};
		},

		_getData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var that = this;
			var aAll = [];
			var iDone = 0;

			function onDone() {
				iDone++;
				if (iDone === 2) {
					sap.ui.core.BusyIndicator.hide();
					that._processData(aAll);
				}
			}

			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) { aAll = aAll.concat(oData.results || []); onDone(); },
				error: function () { onDone(); }
			});

			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) { aAll = aAll.concat(oData.results || []); onDone(); },
				error: function () { onDone(); }
			});
		},

		_processData: function (aData) {
			var c = {
				nrgpPending: 0, nrgpApproved: 0, nrgpRejected: 0,
				rgpPending:  0, rgpApproved:  0, rgpRejected:  0
			};

			aData.forEach(function (item) {
				var t = item.GatePassType;
				var s = item.Status;
				if (t === "NRGP") {
					if (s === "Pending")  { c.nrgpPending++;  }
					else if (s === "Approved") { c.nrgpApproved++; }
					else if (s === "Rejected") { c.nrgpRejected++; }
				} else if (t === "RGP") {
					if (s === "Pending")  { c.rgpPending++;  }
					else if (s === "Approved") { c.rgpApproved++; }
					else if (s === "Rejected") { c.rgpRejected++; }
				}
			});

			var oModel = this.getView().getModel("analytics");
			oModel.setData({
				tiles: {
					total:       aData.length,
					pending:     c.nrgpPending  + c.rgpPending,
					approved:    c.nrgpApproved + c.rgpApproved,
					rejected:    c.nrgpRejected + c.rgpRejected,
					nrgpTotal:   c.nrgpPending  + c.nrgpApproved + c.nrgpRejected,
					rgpTotal:    c.rgpPending   + c.rgpApproved  + c.rgpRejected,
					nrgpPending:  c.nrgpPending,  nrgpApproved: c.nrgpApproved,  nrgpRejected: c.nrgpRejected,
					rgpPending:   c.rgpPending,   rgpApproved:  c.rgpApproved,   rgpRejected:  c.rgpRejected
				},
				barData: [
					{ status: "Pending",  nrgp: c.nrgpPending,  rgp: c.rgpPending  },
					{ status: "Approved", nrgp: c.nrgpApproved, rgp: c.rgpApproved },
					{ status: "Rejected", nrgp: c.nrgpRejected, rgp: c.rgpRejected }
				],
				pieData: [
					{ status: "Pending",  count: c.nrgpPending  + c.rgpPending  },
					{ status: "Approved", count: c.nrgpApproved + c.rgpApproved },
					{ status: "Rejected", count: c.nrgpRejected + c.rgpRejected }
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
						colorPalette: ["#E67E22", "#6A1B9A"],
						dataLabel: { visible: true, formatString: "0" }
					},
					categoryAxis: { title: { visible: false } },
					valueAxis:    { title: { visible: false } }
				});
			}

			var oDonut = this.byId("idDonutChart");
			if (oDonut) {
				oDonut.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					plotArea: {
						colorPalette: ["#E67E22", "#1B6B3A", "#CC2020"],
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
