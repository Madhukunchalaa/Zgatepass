sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, Filter, FilterOperator, JSONModel, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.GatePassList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "gatePassList");
			this.getRouter().getRoute("GatePassList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._getData();
		},

		onSearchFieldLiveChange: function () {
			this._applyClientFilters();
		},

		onSelectFilterChange: function () {
			this._getData();
		},

		onResetButtonPress: function () {
			this.byId("idGatePassSearchField").setValue("");
			this.byId("idStatusFilterSelect").setSelectedKey("");
			this.byId("idTypeFilterSelect").setSelectedKey("");
			this._getData();
		},

		_getData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				return;
			}

			var sSelectedStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var sBackendStatus = "All";
			if (sSelectedStatus && sSelectedStatus !== "Store Approval Pending") {
				sBackendStatus = sSelectedStatus;
			}
			var sType = this.byId("idTypeFilterSelect").getSelectedKey();

			var that = this;
			var aAllResults = [];
			var iDone = 0;
			
			var aTypesToQuery = sType ? [sType] : ["NRGP", "RGP", "PO"];
			var iTarget = aTypesToQuery.length;

			function onBothDone() {
				iDone++;
				if (iDone === iTarget) {
					sap.ui.core.BusyIndicator.hide();
					
					// Client-side sort by original backend Date object or fallback
					aAllResults.sort(function (a, b) {
						var parseDt = function(o) {
							if (!o.GatePassDate) return new Date(0);
							if (o.GatePassDate instanceof Date) return o.GatePassDate;
							var p = String(o.GatePassDate).split("-");
							if (p.length === 3) {
								if (p[0].length === 4) return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
								return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
							}
							return new Date(o.GatePassDate);
						};
						return parseDt(b) - parseDt(a);
					});

					that.getView().getModel("gatePassList").setProperty("/items", aAllResults);
					
					// Apply search and status filters client-side on the updated list
					that._applyClientFilters();
				}
			}

			sap.ui.core.BusyIndicator.show(0);

			aTypesToQuery.forEach(function (typeKey) {
				var aFilters = [
					new Filter("GatePassType", FilterOperator.EQ, typeKey),
					new Filter("Status", FilterOperator.EQ, sBackendStatus)
				];

				oODataModel.read("/GateReqHdrSet", {
					filters: aFilters,
					urlParameters: { "$expand": "GateReqItmNav" },
					success: function (oData) {
						var aResults = oData.results || [];
						aResults = aResults.map(function (oItem) {
							var sReqNo = "";
							if (oItem.GatePassReqNo !== undefined && oItem.GatePassReqNo !== null) {
								sReqNo = String(oItem.GatePassReqNo).trim();
							} else if (oItem.GatePassreqNo !== undefined && oItem.GatePassreqNo !== null) {
								sReqNo = String(oItem.GatePassreqNo).trim();
							}
							return {
								GatePassReqNo: sReqNo,
								GatePassNo: oItem.GatePassNo ? String(oItem.GatePassNo).trim() : "",
								PurchaseOrder: sReqNo,
								GatePassType: typeKey === "PO" ? "GP with PO" : (oItem.GatePassType || typeKey),
								Status: that.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend),
								Plant: oItem.Plant ? String(oItem.Plant).trim() : "",
								VendorName: oItem.VendorName ? String(oItem.VendorName).trim() : "",
								Vendor: oItem.Vendor || "",
								VendorGST: oItem.VendorGST || "",
								City: oItem.City || "",
								ZipCode: oItem.ZipCode || "",
								Department: oItem.Department ? String(oItem.Department).trim() : "",
								Requestor: oItem.Requestor || oItem.RequestedUser || "",
								CommonDesc: oItem.CommonDesc || "",
								VehicleNo: oItem.VehicleNo ? String(oItem.VehicleNo).trim() : "",
								ModeOfDispatch: oItem.ModeOfDispatch || "",
								LRNumber: oItem.LRNumber || oItem.LRNnumber || "",
								TransporterName: oItem.TransporterName || "",
								ChallanNumber: oItem.ChallanNumber || "",
								ChallanDate: oItem.ChallanDate || "",
								Remarks: oItem.Remarks || "",
								HODRemarks: oItem.HODRemarks || "",
								GatePassDate: oItem.GatePassDate || null,
								Approval1: oItem.Approval1 || "",
								Approval2: oItem.Approval2 || "",
								ApprovalReq: oItem.ApprovalReq || "",
								STORERemarks: oItem.STORERemarks || oItem.StoreRemarks || "",
								StoreAmmend: oItem.StoreAmmend || "",
								GateReqItmNav: oItem.GateReqItmNav || null
							};
						});
						aAllResults = aAllResults.concat(aResults);
						onBothDone();
					},
					error: function () {
						onBothDone();
					}
				});
			});
		},

		onDatePickerChange: function () {
			this._applyClientFilters();
		},

		onDateFilterChange: function () {
			this._applyClientFilters();
		},

		onResetButtonPress: function () {
			this.byId("idGatePassSearchField").setValue("");
			this.byId("idStatusFilterSelect").setSelectedKey("");
			this.byId("idTypeFilterSelect").setSelectedKey("");
			this.byId("idExcelFromDate").setValue("");
			this.byId("idExcelToDate").setValue("");
			this._getData();
		},

		_applyClientFilters: function () {
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable.getBinding("items");
			if (!oBinding) {
				return;
			}

			var aAllItems = this.getView().getModel("gatePassList").getProperty("/items") || [];
			var sSearch = this.byId("idGatePassSearchField").getValue().trim();
			var sSelectedStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();

			var sLow = sSearch.toLowerCase();
			var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
			var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;

			var aFiltered = aAllItems.filter(function (o) {
				// 1. Text search
				if (sSearch) {
					var sReq  = o.GatePassReqNo ? String(o.GatePassReqNo).trim() : "";
					var sGP   = o.GatePassNo    ? String(o.GatePassNo).trim()    : "";
					var sVend = o.VendorName     ? String(o.VendorName).trim()    : "";
					var sUser = o.Requestor      ? String(o.Requestor).trim()     : "";
					var sDesc = o.CommonDesc     ? String(o.CommonDesc).trim()    : "";
					var sRem  = o.Remarks        ? String(o.Remarks).trim()       : "";
					var sDept = o.Department     ? String(o.Department).trim()    : "";
					var matched = [sReq, sGP, sVend, sUser, sDesc, sRem, sDept]
						.some(function (f) { return f.toLowerCase().indexOf(sLow) !== -1; });
					if (!matched) { return false; }
				}

				// 2. Status filter
				if (sSelectedStatus && o.Status !== sSelectedStatus) { return false; }

				// 3. Date filter
				if (oFrom || oTo) {
					var vDate = o.GatePassDate;
					if (!vDate) { return false; }
					var oItemDate = new Date(vDate);
					if (isNaN(oItemDate.getTime())) {
						var p = String(vDate).split("-");
						if (p.length === 3) {
							oItemDate = p[0].length === 4
								? new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
								: new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
						}
					}
					if (isNaN(oItemDate.getTime())) { return false; }
					if (oFrom && oItemDate < oFrom) { return false; }
					if (oTo   && oItemDate > oTo)   { return false; }
				}

				return true;
			});

			// Set filtered results into a temporary model property and rebind
			this.getView().getModel("gatePassList").setProperty("/filtered", aFiltered);
			oTable.bindItems({
				path: "gatePassList>/filtered",
				template: oTable.getBindingInfo("items").template,
				templateShareable: true
			});

			this._updateCount();
		},

		_rawApplyFilters_UNUSED: function () {
			// Kept as reference – not used
			// Date wise filter
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "",
					test: function (v, oContext) {
						var oRow = oContext ? oContext.getObject() : null;
						var vDate = oRow ? oRow.GatePassDate : null;
						if (!vDate) { return false; }
						var oItemDate = new Date(vDate);
						if (isNaN(oItemDate.getTime())) {
							// Try parsing DD-MM-YYYY
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
			this._updateCount();
		},

		_updateCount: function () {
			var oBinding = this.byId("idItemsGatePassTable").getBinding("items");
			if (oBinding) {
				var n = oBinding.getLength();
				// For JSONModel, getLength() may not be stable right after rebindItems
				// so also check the filtered array directly
				var aFiltered = this.getView().getModel("gatePassList").getProperty("/filtered");
				if (Array.isArray(aFiltered)) { n = aFiltered.length; }
				this.byId("idItemCountText").setText(n + " Items");
			}
		},

		onPrintList: function () {
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("gatePassList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Gate Pass Requests List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Gate Pass Requests List</h2><table><thead><tr>";
			sHtml += "<th>Request No.</th><th>Type</th><th>Date</th><th>Status</th><th>Plant</th><th>Vendor Name</th><th>Department</th><th>Gate Pass Created</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				var sDate = "";
				if (o.GatePassDate) {
					var d = new Date(o.GatePassDate);
					sDate = d.getDate().toString().padStart(2, "0") + "-" + (d.getMonth() + 1).toString().padStart(2, "0") + "-" + d.getFullYear();
				}
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GatePassReqNo || "") + "</td>";
				sHtml += "<td>" + (o.GatePassType || "") + "</td>";
				sHtml += "<td>" + sDate + "</td>";
				sHtml += "<td>" + (o.Status || "") + "</td>";
				sHtml += "<td>" + (o.Plant || "") + "</td>";
				sHtml += "<td>" + (o.VendorName || "") + "</td>";
				sHtml += "<td>" + (o.Department || "") + "</td>";
				sHtml += "<td>" + (o.GatePassNo || "") + "</td>";
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
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("gatePassList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["Request No.", "Type", "Date", "Status", "Plant", "Vendor Name", "Department", "Gate Pass Created"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				var sDate = "";
				if (o.GatePassDate) {
					var d = new Date(o.GatePassDate);
					sDate = d.getDate().toString().padStart(2, "0") + "-" + (d.getMonth() + 1).toString().padStart(2, "0") + "-" + d.getFullYear();
				}
				aLines.push([
					o.GatePassReqNo || "",
					o.GatePassType || "",
					sDate,
					o.Status || "",
					o.Plant || "",
					o.VendorName || "",
					o.Department || "",
					o.GatePassNo || ""
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

		onApproveButtonPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem) { return; }

			// Derive computed values because detail view expects them
			var sDerivedStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);
			var oRowData = JSON.parse(JSON.stringify(oItem));
			oRowData.Status = sDerivedStatus;

			// Cache row for StoreRequestDetail
			var oTemp = this.getOwnerComponent().getModel("storeTemp");
			if (!oTemp) {
				oTemp = new sap.ui.model.json.JSONModel();
				this.getOwnerComponent().setModel(oTemp, "storeTemp");
			}
			oTemp.setData(oRowData);

			this.getRouter().navTo("StoreRequestDetail", {
				reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
				gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
			});
		},

		onObjectIdentifierReqNoTitlePress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem || oItem.GatePassType === "GP with PO") {
				return;
			}
			if (oItem.GatePassNo) {
				sap.m.MessageBox.information("Gate Pass " + oItem.GatePassNo + " has already been created for this request.");
				return;
			}
			
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var sRole = oUserModel ? oUserModel.getProperty("/Role") : "";
			var sStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			if (bAmendment) {
				sap.m.MessageBox.information("This request is pending amendment by the requester.");
			} else if (bIsStoreUser) {
				if (bApproved) {
					this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				} else {
					var oRowData = JSON.parse(JSON.stringify(oItem));
					oRowData.Status = sStatus;
					var oTemp = this.getOwnerComponent().getModel("storeTemp");
					if (!oTemp) {
						oTemp = new sap.ui.model.json.JSONModel();
						this.getOwnerComponent().setModel(oTemp, "storeTemp");
					}
					oTemp.setData(oRowData);
					this.getRouter().navTo("StoreRequestDetail", {
						reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
						gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
					});
				}
			} else {
				sap.m.MessageBox.warning("Access to Out Gate Pass creation is only allowed for Approved requests under the Store User (ZC_MM_GATEPASS_STORE_FRONTVIEW) role.\n\nYour current Role: " + (sRole || "No Role Assigned"));
			}
		},

		onColumnListItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem) { return; }
			if (oItem.GatePassNo) {
				sap.m.MessageBox.information("Gate Pass " + oItem.GatePassNo + " has already been created for this request.");
				return;
			}
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var bIsHodUser   = oUserModel ? oUserModel.getProperty("/IsHodUser")   : false;
			var sRole   = oUserModel ? oUserModel.getProperty("/Role")   : "";
			var sStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			// Amendment: only the requester (non-HOD, non-Store) can edit and resubmit
			if (bAmendment) {
				if (!bIsHodUser && !bIsStoreUser) {
					this.getRouter().navTo("GatePassAmendment", {
						type:   encodeURIComponent(oItem.GatePassType  || "NRGP"),
						reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
						status: encodeURIComponent(sStatus || "AM")
					});
				} else {
					sap.m.MessageBox.information("This request is pending amendment by the requester.");
				}
				return;
			}

			// For fully approved requests, any user clicking the row goes directly to generate gate pass
			if (bApproved) {
				this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				return;
			}

			if (bIsHodUser) {
				var oRowData = JSON.parse(JSON.stringify(oItem));
				oRowData.Status = sStatus;
				// Cache the full row object so HODRequestDetail can display immediately
				var oTemp = this.getOwnerComponent().getModel("hodTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "hodTemp");
				}
				oTemp.setData(oRowData);

				// HOD: navigate to read-only detail with Approve/Reject/Amendment actions
				this.getRouter().navTo("HODRequestDetail", {
					reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
					gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
				});
				return;
			}

			if (bIsStoreUser && !bApproved && !bAmendment) {
				var oRowData = JSON.parse(JSON.stringify(oItem));
				oRowData.Status = sStatus;
				var oTemp = this.getOwnerComponent().getModel("storeTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "storeTemp");
				}
				oTemp.setData(oRowData);
				this.getRouter().navTo("StoreRequestDetail", {
					reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
					gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
				});
				return;
			}

			// Non-HOD legacy behaviour
			if (oItem.GatePassType === "GP with PO") {
				sap.m.MessageBox.information(
					"Gate Pass No: " + oItem.GatePassNo + "\n" +
					"Purchase Order: " + oItem.PurchaseOrder + "\n" +
					"Type: Gate Pass with PO\n" +
					"Status: " + sStatus + "\n" +
					"Plant: " + oItem.Plant + "\n" +
					"Vendor: " + oItem.VendorName + "\n" +
					"Department: " + oItem.Department + "\n" +
					"DC/Invoice Number: " + (oItem.VehicleNo || "N/A") + "\n\n" +
					"Note: This Gate Pass was created directly from Purchase Order details and is finalized on creation.",
					{ title: "PO Gate Pass Details" }
				);
				return;
			}
			this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo });
		},

		formatStatus: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			return this._deriveStatus({
				Status: sStatus,
				Approval1: sApproval1,
				Approval2: sApproval2,
				ApprovalReq: sApprovalReq,
				STORERemarks: sStoreRemarks,
				StoreAmmend: sStoreAmmend
			});
		},

		formatStatusState: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			var sDerived = this.formatStatus(sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend);
			if (sDerived === "Approved" || sDerived === "Closed" || sDerived === "CLOSED") {
				return "Success";
			}
			if (sDerived === "Rejected" || sDerived === "Cancelled" || sDerived === "REJECTED" || sDerived === "CANCELLED") {
				return "Error";
			}
			return "Warning";
		},

		onDownloadExcelButtonPress: function () {
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			} else {
				aObjects = this.getView().getModel("gatePassList").getProperty("/items") || [];
			}
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GatePassDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var aRows = [];
			aObjects.forEach(function (o) {
				var sDate = "";
				if (o.GatePassDate) {
					var d = new Date(o.GatePassDate);
					sDate = d.getDate().toString().padStart(2, "0") + "-" +
						(d.getMonth() + 1).toString().padStart(2, "0") + "-" +
						d.getFullYear();
				}
				var oHeader = {
					"Request No": o.GatePassReqNo || "",
					"Gate Pass No": o.GatePassNo || "",
					"Type": o.GatePassType || "",
					"Date": sDate,
					"Status": o.Status || "",
					"Plant": o.Plant || "",
					"Vendor Code": o.Vendor || "",
					"Vendor Name": o.VendorName || "",
					"Vendor GST": o.VendorGST || "",
					"City": o.City || "",
					"Zip Code": o.ZipCode || "",
					"Department": o.Department || "",
					"Vehicle No": o.VehicleNo || "",
					"Mode of Dispatch": o.ModeOfDispatch || "",
					"LR Number": o.LRNumber || "",
					"Transporter": o.TransporterName || "",
					"Challan No": o.ChallanNumber || "",
					"Challan Date": o.ChallanDate || "",
					"Remarks": o.Remarks || "",
					"HOD Remarks": o.HODRemarks || "",
					"Store Remarks": o.STORERemarks || "",
					"Store Amend": o.StoreAmmend || ""
				};
				var aItems = (o.GateReqItmNav && o.GateReqItmNav.results) || (Array.isArray(o.GateReqItmNav) ? o.GateReqItmNav : []);
				if (aItems.length > 0) {
					aItems.forEach(function (itm) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = itm.ItemNo || "";
						oRow["Material"] = itm.Material || "";
						oRow["Material Desc"] = itm.MaterialDesc || itm.Description || "";
						oRow["HSN Code"] = itm.HSNCode || "";
						oRow["Quantity"] = itm.Quantity || "";
						oRow["Item UOM"] = itm.UOM || "";
						aRows.push(oRow);
					});
				} else {
					oHeader["Item No"] = "";
					oHeader["Material"] = "";
					oHeader["Material Desc"] = "";
					oHeader["HSN Code"] = "";
					oHeader["Quantity"] = "";
					oHeader["Item UOM"] = "";
					aRows.push(oHeader);
				}
			});
			var sType = this.byId("idTypeFilterSelect").getSelectedKey();
			var sStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var aParts = ["Gate_Pass"];
			if (sType) { aParts.push(sType.replace(/\s+/g, "_")); }
			if (sStatus) { aParts.push(sStatus.replace(/\s+/g, "_")); }
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			var sFileName = aParts.join("_") + ".xlsx";
			var sSheetName = aParts.join(" ");
			ExcelExport.download(aRows, sSheetName, sFileName, 22);
		},

		showApproveBtn: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			var sDerived = this.formatStatus(sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend);
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsGatepassUserOnly = oUserModel ? oUserModel.getProperty("/IsGatepassUserOnly") : false;
			var bIsHodUser = oUserModel ? oUserModel.getProperty("/IsHodUser") : false;
			return (sDerived === "Store Approval Pending") && !bIsGatepassUserOnly && !bIsHodUser;
		}

	});
});
