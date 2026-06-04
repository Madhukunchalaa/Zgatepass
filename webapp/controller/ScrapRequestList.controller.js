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
			
			// Load local overrides
			var aLocalRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");

			var fnFallback = function () {
				var oModel = new JSONModel(aLocalRequests);
				that.getView().setModel(oModel, "scrapList");
			};

			if (!oODataModel) {
				fnFallback();
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
						
						// Find if there is a local override for this request
						var oLocalOverride = aLocalRequests.find(function (req) {
							return req.requestId === sRequestId;
						});

						// Format date
						var sDateStr = that._formatRequestDate(oItem.RequestDate || oItem.ReqDate);

						// Map items
						var aItems = [];
						if (oItem.ScrapReqItmNav && oItem.ScrapReqItmNav.results) {
							aItems = oItem.ScrapReqItmNav.results.map(function(oSubItem, index) {
								var sRawUom = (oSubItem.UOM || oSubItem.Uom || "").toUpperCase();
								var sUom = "KG";
								if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
									sUom = "KG";
								} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
									sUom = "L";
								} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
									sUom = "MT";
								}
								return {
									sno: String(index + 1),
									type: that._mapMaterialType(oSubItem.Material || oSubItem.MaterialType || oSubItem.Type || "", oSubItem.MaterialDesc || oSubItem.Description || ""),
									description: oSubItem.MaterialDesc || oSubItem.Description || "",
									quantity: String(oSubItem.OrderQuantity || oSubItem.Quantity || oSubItem.Qty || "0"),
									uom: sUom
								};
							});
						} else if (oLocalOverride && oLocalOverride.items) {
							aItems = oLocalOverride.items;
						}

						var sStatus = "Pending";
						if (oItem.ApprovalReq === "A") {
							sStatus = "Approved";
						} else if (oItem.ApprovalReq === "P") {
							sStatus = "Pending";
						} else if (oItem.ApprovalReq === "R") {
							sStatus = "Rejected";
						} else if (oItem.Status || oItem.ReqStatus) {
							sStatus = oItem.Status || oItem.ReqStatus;
						}

						return {
							requestId: sRequestId,
							requestDate: oItem.RequestDate || (oLocalOverride ? oLocalOverride.requestDate : null),
							requestDateStr: sDateStr || (oLocalOverride ? oLocalOverride.requestDateStr : ""),
							vehicleDetails: (oLocalOverride && oLocalOverride.vehicleDetails) ? oLocalOverride.vehicleDetails : (oItem.VehicleNo || oItem.VehicleDetails || ""),
							collectArea: (oLocalOverride && oLocalOverride.collectArea) ? oLocalOverride.collectArea : (oItem.CollectArea || ""),
							remarks: (oLocalOverride && oLocalOverride.remarks) ? oLocalOverride.remarks : (oItem.Remarks || ""),
							status: (oLocalOverride && oLocalOverride.status) ? oLocalOverride.status : sStatus,
							weighmentSlipNo: (oLocalOverride && oLocalOverride.weighmentSlipNo) ? oLocalOverride.weighmentSlipNo : (oItem.WeighmentSlipNo || ""),
							challanDateTime: (oLocalOverride && oLocalOverride.challanDateTime) ? oLocalOverride.challanDateTime : (oItem.ChallanDateTime || ""),
							items: aItems
						};
					});

					// Append local-only requests (e.g. newly created requests not yet in OData)
					aLocalRequests.forEach(function (oLocal) {
						var bExists = aODataList.some(function (oOData) {
							return oOData.requestId === oLocal.requestId;
						});
						if (!bExists) {
							aODataList.push(oLocal);
						}
					});

					var oModel = new JSONModel(aODataList);
					that.getView().setModel(oModel, "scrapList");
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					fnFallback();
				}
			});
		},

		_formatRequestDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				var dd = String(vDate.getDate()).padStart(2, '0');
				var mm = String(vDate.getMonth() + 1).padStart(2, '0');
				var yyyy = vDate.getFullYear();
				return dd + "/" + mm + "/" + yyyy;
			}
			if (typeof vDate === "string") {
				if (vDate.indexOf("Date") !== -1) {
					var timestamp = parseInt(vDate.replace(/\/Date\((\d+)\)\//, "$1"), 10);
					if (!isNaN(timestamp)) {
						return this._formatRequestDate(new Date(timestamp));
					}
				}
				if (/^\d{8}$/.test(vDate)) {
					return vDate.substring(6, 8) + "/" + vDate.substring(4, 6) + "/" + vDate.substring(0, 4);
				}
				var aParts = vDate.split("T")[0].split("-");
				if (aParts.length === 3) {
					return aParts[2] + "/" + aParts[1] + "/" + aParts[0];
				}
			}
			return String(vDate);
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
			if (bIsHod) {
				this.getRouter().navTo("ScrapRequestDetail", {
					gpNo: encodeURIComponent(sRequestId)
				});
				return;
			}

			if (sStatus === "Gate Pass Generated") {
				MessageBox.error("Already gate pass created for this request number");
				return;
			}
			
			this.getRouter().navTo("ScrapGatepassCreationWithReq", {
				reqNo: encodeURIComponent(sRequestId)
			});
		}

	});
});
