sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox) {
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
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				that.getView().setModel(new JSONModel([]), "scrapList");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ScrapReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "ScrapReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aODataList = (oData.results || []).map(function (oItem) {
						var sRequestId = oItem.GatePassReqNo || oItem.RequestId || "";

						// Format date
						var sDateStr = that._formatDateSlash(oItem.RequestDate || oItem.ReqDate);

						// Map items
						var aItems = [];
						if (oItem.ScrapReqItmNav && oItem.ScrapReqItmNav.results) {
							aItems = oItem.ScrapReqItmNav.results.map(function(oSubItem, index) {
								var sUom = that._normalizeUOM(oSubItem.UOM || oSubItem.Uom || "");
								return {
									sno: String(index + 1),
									type: that._mapMaterialType(oSubItem.Material || oSubItem.MaterialType || oSubItem.Type || "", oSubItem.MaterialDesc || oSubItem.Description || ""),
									description: oSubItem.MaterialDesc || oSubItem.Description || "",
									quantity: String(oSubItem.OrderQuantity || oSubItem.Quantity || oSubItem.Qty || "0"),
									uom: sUom
								};
							});
						}

						var sStatus = that._deriveStatus(oItem);

						return {
							requestId: sRequestId,
							requestDate: oItem.RequestDate || null,
							requestDateStr: sDateStr,
							vehicleDetails: oItem.VehicleNo || oItem.VehicleDetails || "",
							collectArea: oItem.CollectArea || "",
							remarks: oItem.Remarks || "",
							status: sStatus,
							weighmentSlipNo: oItem.WeighmentSlipNo || "",
							challanDateTime: oItem.ChallanDateTime || "",
							items: aItems,
							Approval1: oItem.Approval1 || "",
							Approval2: oItem.Approval2 || ""
						};
					});

					var oModel = new JSONModel(aODataList);
					that.getView().setModel(oModel, "scrapList");
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Scrap Request list. Please try again.");
					that.getView().setModel(new JSONModel([]), "scrapList");
				}
			});
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
			var sStatus = oContext.getProperty("status");

			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsHod = oUserModel && oUserModel.getProperty("/IsHodUser");
			var bIsStoreUser = oUserModel && oUserModel.getProperty("/IsStoreUser");
			
			var bApproved = sStatus === "Approved" || sStatus === "APPROVED" || sStatus === "A";

			if (bIsHod) {
				this.getRouter().navTo("ScrapRequestDetail", {
					gpNo: encodeURIComponent(sRequestId)
				});
				return;
			}

			if (bIsStoreUser) {
				if (bApproved) {
					this.getRouter().navTo("ScrapGatepassCreationWithReq", {
						reqNo: encodeURIComponent(sRequestId)
					});
				} else {
					this.getRouter().navTo("ScrapRequestDetail", {
						gpNo: encodeURIComponent(sRequestId)
					});
				}
				return;
			}

			if (bApproved) {
				MessageBox.error("Already gate pass created for this request number");
				return;
			}
			
			this.getRouter().navTo("ScrapGatepassCreationWithReq", {
				reqNo: encodeURIComponent(sRequestId)
			});
		}

	});
});
