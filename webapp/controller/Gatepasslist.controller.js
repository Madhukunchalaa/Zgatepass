sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel"
], function (BaseController, Filter, FilterOperator, JSONModel) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.GatePassList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "gatePassList");
			this.getRouter().getRoute("GatePassList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this.getView().getModel("gatePassList").setProperty("/items", []);
			this._getData();
		},

		_getData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				return;
			}

			var that = this;
			var aAllResults = [];
			var iDone = 0;

			function onBothDone() {
				iDone++;
				if (iDone === 2) {
					sap.ui.core.BusyIndicator.hide();
					that.getView().getModel("gatePassList").setProperty("/items", aAllResults);
					that._updateCount();
				}
			}

			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) {
					aAllResults = aAllResults.concat(oData.results || []);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) {
					aAllResults = aAllResults.concat(oData.results || []);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});
		},

		onSearchFieldLiveChange: function () {
			this._applyFilters();
		},

		onSelectFilterChange: function () {
			this._applyFilters();
		},

		onResetButtonPress: function () {
			this.byId("idGatePassSearchField").setValue("");
			this.byId("idStatusFilterSelect").setSelectedKey("");
			this.byId("idTypeFilterSelect").setSelectedKey("");
			this._applyFilters();
		},

		_applyFilters: function () {
			var oBinding = this.byId("idItemsGatePassTable").getBinding("items");
			var aFilters = [];

			var sSearch = this.byId("idGatePassSearchField").getValue().trim();
			if (sSearch) {
				aFilters.push(new Filter("GatePassReqNo", FilterOperator.Contains, sSearch));
			}

			var sStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			if (sStatus) {
				aFilters.push(new Filter("Status", FilterOperator.EQ, sStatus));
			}

			var sType = this.byId("idTypeFilterSelect").getSelectedKey();
			if (sType) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, sType));
			}

			oBinding.filter(aFilters);
			this._updateCount();
		},

		_updateCount: function () {
			var oBinding = this.byId("idItemsGatePassTable").getBinding("items");
			if (oBinding) {
				this.byId("idItemCountText").setText(oBinding.getLength() + " Items");
			}
		},

		onColumnListItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			console.log("Selected:", oItem.GatePassReqNo);
		}

	});
});
