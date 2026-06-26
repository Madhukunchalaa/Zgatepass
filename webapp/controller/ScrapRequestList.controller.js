sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
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
							collectArea: oItem.CollectArea || oItem.ScrapArea || "",
							remarks: oItem.Remarks || "",
							status: sStatus,
							weighmentSlipNo: oItem.WeighmentSlipNo || oItem.WeighmentTicket || "",
							challanDateTime: oItem.ChallanDateTime || oItem.ChallanDate || "",
							items: aItems,
							Approval1: oItem.Approval1 || "",
							Approval2: oItem.Approval2 || "",
							salesDocument: oItem.SalesDocument || "",
							soldToParty: oItem.SoldToParty || "",
							customerName: oItem.CustomerName || "",
							customerGst: oItem.CustomerGst || "",
							city: oItem.City || "",
							postalCode: oItem.PostalCode || "",
							approvalReq: oItem.ApprovalReq || ""
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

		onDownloadExcel: function () {
			var aObjects = this.getView().getModel("scrapList").getData() || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "requestDateStr", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = [];
			aObjects.forEach(function (o) {
				var oHeader = {
					"Request No": o.requestId || "",
					"Date": o.requestDateStr || "",
					"Vehicle No": o.vehicleDetails || "",
					"Status": o.status || "",
					"Sales Document": o.salesDocument || "",
					"Sold To Party": o.soldToParty || "",
					"Customer Name": o.customerName || "",
					"Customer GST": o.customerGst || "",
					"City": o.city || "",
					"Postal Code": o.postalCode || "",
					"Approval Required": o.approvalReq || "",
					"Approval 1": o.Approval1 || "",
					"Approval 2": o.Approval2 || "",
					"Weighment Ticket": o.weighmentSlipNo || "",
					"Scrap Area": o.collectArea || "",
					"Challan Date": o.challanDateTime || "",
					"Remarks": o.remarks || ""
				};
				var aItems = o.items || [];
				if (aItems.length === 0) {
					oHeader["Item SNo"] = "";
					oHeader["Item Type"] = "";
					oHeader["Item Description"] = "";
					oHeader["Item Quantity"] = "";
					oHeader["Item UOM"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (item) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item SNo"] = item.sno || "";
						oRow["Item Type"] = item.type || "";
						oRow["Item Description"] = item.description || "";
						oRow["Item Quantity"] = item.quantity || "";
						oRow["Item UOM"] = item.uom || "";
						aRows.push(oRow);
					});
				}
			});
			var aParts = ["Scrap_Request"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 17);
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
