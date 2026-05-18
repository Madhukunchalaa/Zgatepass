sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._loadList();
		},

		_loadList: function () {
			// Fetch from mock local storage
			var aMockList = JSON.parse(localStorage.getItem("mockAshList") || "[]");
			var oModel = new JSONModel(aMockList);
			this.getView().setModel(oModel, "ashList");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue");
			var oTable = this.getView().byId("ashListTable");
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
				// if button pressed
				oItem = oItem.getParent();
			}
			var oContext = oItem.getBindingContext("ashList");
			var sRequestId = oContext.getProperty("requestId");
			
			// Nav to Detail view (mocking gpNo mapping to requestId)
			this.getRouter().navTo("AshGatePassDetail", {
				gpNo: encodeURIComponent(sRequestId)
			});
		}

	});
});
