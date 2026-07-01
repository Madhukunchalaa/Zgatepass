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

		onDateFilterChange: function () {
			this._applyFilters();
		},

		onSearch: function (oEvent) {
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("scrapRequestTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) { return; }

			var aFilters = [];

			// 1. Text Search Filter
			var sSearch = this.byId("scrapRequestTable").getHeaderToolbar().getContent().find(function(c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			}).getValue().trim();

			if (sSearch) {
				var sLow = sSearch.toLowerCase();
				aFilters.push(new Filter({
					path: "requestId",
					test: function(v, oContext) {
						var o = oContext ? oContext.getObject() : {};
						return [
							(o.requestId || ""),
							(o.vehicleDetails || ""),
							(o.status || ""),
							(o.customerName || "")
						].some(function(f) { return String(f).toLowerCase().indexOf(sLow) !== -1; });
					}
				}));
			}

			// 2. Date Filter
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "requestDate",
					test: function(vDate) {
						if (!vDate) { return false; }
						var oItemDate = new Date(vDate);
						if (isNaN(oItemDate.getTime())) {
							var p = String(vDate).split("-");
							if (p.length === 3) {
								if (p[0].length === 4) {
									oItemDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
								} else {
									oItemDate = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
								}
							}
						}
						if (isNaN(oItemDate.getTime())) { return false; }
						if (oFrom && oItemDate < oFrom) { return false; }
						if (oTo && oItemDate > oTo) { return false; }
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
		},

		onPrintList: function () {
			var oTable = this.byId("scrapRequestTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("scrapList").getData() || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Scrap Requests List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Scrap Requests List</h2><table><thead><tr>";
			sHtml += "<th>Request No</th><th>Date</th><th>Vehicle No</th><th>Status</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.requestId || "") + "</td>";
				sHtml += "<td>" + (o.requestDateStr || "") + "</td>";
				sHtml += "<td>" + (o.vehicleDetails || "") + "</td>";
				sHtml += "<td>" + (o.status || "") + "</td>";
				sHtml += "</tr>";
			});
			sHtml += "</tbody></table></body></html>";
			var oWindow = window.open("", "_blank");
			oWindow.document.write(sHtml);
			oWindow.document.close();
			oWindow.focus();
			setTimeout(function () { oWindow.print(); oWindow.close(); }, 500);
		},

		onCopyList: function () {
			var oTable = this.byId("scrapRequestTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("scrapList").getData() || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["Request No", "Date", "Vehicle No", "Status"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				aLines.push([
					o.requestId || "",
					o.requestDateStr || "",
					o.vehicleDetails || "",
					o.status || ""
				].join("\t"));
			});
			var sText = aLines.join("\n");
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(sText).then(function () {
					sap.m.MessageToast.show("List copied to clipboard.");
				});
			} else {
				var el = document.createElement("textarea");
				el.value = sText;
				document.body.appendChild(el);
				el.select();
				document.execCommand("copy");
				document.body.removeChild(el);
				sap.m.MessageToast.show("List copied to clipboard.");
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
