sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapRequestList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapRequestList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._loadList();
		},

		_loadList: function () {
			var aMockList = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
			var oModel = new JSONModel(aMockList);
			this.getView().setModel(oModel, "scrapList");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue");
			var oTable = this.getView().byId("scrapRequestTable");
			var oBinding = oTable.getBinding("items");
			
			if (sQuery) {
				var oFilter = new Filter("requestId", FilterOperator.Contains, sQuery);
				oBinding.filter([oFilter]);
			} else {
				oBinding.filter([]);
			}
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource();
			if (oItem.getMetadata().getName() === "sap.m.Button") {
				oItem = oItem.getParent();
			}
			var oContext = oItem.getBindingContext("scrapList");
			var sRequestId = oContext.getProperty("requestId");
			
			this.getRouter().navTo("ScrapRequestDetail", {
				gpNo: encodeURIComponent(sRequestId)
			});
		}

	});
});
