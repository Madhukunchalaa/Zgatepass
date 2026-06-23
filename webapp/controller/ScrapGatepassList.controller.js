sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapGatepassList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapGatepassList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			var fnFallback = function () {
				that.getView().setModel(new JSONModel([]), "scrapGpList");
			};

			if (!oODataModel) {
				fnFallback();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ScrapPassHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "ScrapPassItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aList = (oData.results || []).map(function (oItem) {
						// Format date
						var sDateStr = that._formatDateSlash(oItem.RequestDate);

						// Map items
						var aItems = [];
						if (oItem.ScrapPassItmNav && oItem.ScrapPassItmNav.results) {
							aItems = oItem.ScrapPassItmNav.results.map(function (oSub, idx) {
								var sUom = that._normalizeUOM(oSub.UOM || "");
								return {
									sno: String(idx + 1),
									itemNo: oSub.ItemNo || "",
									material: oSub.Material || "",
									description: oSub.MaterialDesc || "",
									orderQty: String(oSub.OrderQuantity || "0"),
									sendoutQty: String(oSub.SendoutQuantity || "0"),
									uom: sUom
								};
							});
						}

						return {
							gatePassNo: oItem.GatePassNo || "",
							requestId: oItem.GatePassReqNo || "",
							salesDocument: oItem.SalesDocument || "",
							requestDateStr: sDateStr,
							requestDate: oItem.RequestDate || "",
							customerNo: oItem.SoldToParty || "",
							customerName: oItem.CustomerName || "",
							city: oItem.City || "",
							postalCode: oItem.PostalCode || "",
							customerGst: oItem.CustomerGst || "",
							vehicleNo: oItem.VehicleNo || "",
							remarks: oItem.Remarks || "",
							items: aItems
						};
					});

					that.getView().setModel(new JSONModel(aList), "scrapGpList");
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					fnFallback();
				}
			});
		},


		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
			var oTable = this.getView().byId("scrapGpTable");
			var oBinding = oTable.getBinding("items");

			if (sQuery) {
				var oFilter = new Filter({
					filters: [
						new Filter("gatePassNo", FilterOperator.Contains, sQuery),
						new Filter("requestId", FilterOperator.Contains, sQuery),
						new Filter("customerName", FilterOperator.Contains, sQuery),
						new Filter("vehicleNo", FilterOperator.Contains, sQuery)
					],
					and: false
				});
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
			var oContext = oItem.getBindingContext("scrapGpList");
			if (!oContext) return;

			var sGpNo = oContext.getProperty("gatePassNo");
			if (sGpNo) {
				this.getRouter().navTo("ScrapGatepassDetail", {
					gpNo: encodeURIComponent(sGpNo)
				});
			}
		}

	});
});
