sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassBulkUpload", {

		onInit: function () {
			this.getRouter().getRoute("AshGatePassBulkUpload").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._initModel();
		},

		_initModel: function () {
			var oModel = new JSONModel({
				rows: []
			});
			this.getView().setModel(oModel, "upload");
			
			// Clear FileUploader UI
			var oFU = this.byId("excelFileUploader");
			if (oFU) { oFU.clear(); }
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onClear: function () {
			this._initModel();
		},

		_loadSheetJS: function () {
			return new Promise(function (resolve, reject) {
				if (window.XLSX) {
					resolve(window.XLSX);
					return;
				}
				sap.ui.dom.includeScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js")
					.then(function () {
						resolve(window.XLSX);
					})
					.catch(function (err) {
						reject(err);
					});
			});
		},

		onDownloadTemplate: function () {
			this._loadSheetJS().then(function (XLSX) {
				var aHeaders = [
					["TAQA - GPMS - All Ash GP Report"],
					["Sno", "Issue Date", "Ash Gate Pass Number", "Vendor Name", "Item Description", "Qty Send", "Uom", "HSN Code", "UOP", "Line Cost Value", "Total Value", "Gate Pass Remarks", "DC No", "DC Notes", "Vehicle No", "Transport Name", "Transporter GST", "Request User Name", "Approver Name", "Department", "Status"]
				];
				var ws = XLSX.utils.aoa_to_sheet(aHeaders);
				var wb = XLSX.utils.book_new();
				XLSX.utils.book_append_sheet(wb, ws, "Upload Template");
				XLSX.writeFile(wb, "AshGatePass_Upload_Template.xlsx");
			}).catch(function (err) {
				MessageBox.error("Failed to load Excel library: " + err);
			});
		},

		onExcelUpload: function (oEvent) {
			var oFile = oEvent.getParameter("files")[0];
			if (!oFile) { return; }

			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			this._loadSheetJS().then(function (XLSX) {
				var reader = new FileReader();
				reader.onload = function (e) {
					var data = new Uint8Array(e.target.result);
					var workbook = XLSX.read(data, { type: "array" });
					var firstSheetName = workbook.SheetNames[0];
					var worksheet = workbook.Sheets[firstSheetName];
					
					var rangeOffset = 0;
					// Detect title row (e.g. TAQA - GPMS - All Ash GP Report)
					var cellA1 = worksheet["A1"] ? worksheet["A1"].v : "";
					if (cellA1 && String(cellA1).toLowerCase().indexOf("report") !== -1) {
						rangeOffset = 1;
					} else {
						var cellA2 = worksheet["A2"] ? worksheet["A2"].v : "";
						if (cellA2 && String(cellA2).toLowerCase().indexOf("sno") !== -1) {
							rangeOffset = 1;
						}
					}
					
					var aRows = XLSX.utils.sheet_to_json(worksheet, { range: rangeOffset });

					if (aRows.length === 0) {
						sap.ui.core.BusyIndicator.hide();
						MessageBox.error("The uploaded Excel file is empty.");
						return;
					}

					var aFormattedRows = aRows.map(function (row, idx) {
						return {
							Index: idx + 1,
							IssueDate: row["Issue Date"] || "",
							OriginalGPNo: row["Ash Gate Pass Number"] || "",
							VendorName: row["Vendor Name"] || "",
							ItemDescription: row["Item Description"] || "",
							RequestedQuantity: row["Qty Send"] ? parseFloat(row["Qty Send"]) || 0 : 0,
							Uom: row["Uom"] || "",
							HSNCode: row["HSN Code"] || "",
							ItemNetPrice: row["UOP"] ? parseFloat(row["UOP"]) || 0 : 0,
							Remarks: row["Gate Pass Remarks"] || "",
							DCNumber: row["DC No"] || "",
							DCNotes: row["DC Notes"] || "",
							VehicleNo: row["Vehicle No"] || "",
							TransporterName: row["Transport Name"] || "",
							TransporterGst: row["Transporter GST"] || "",
							StatusText: "Ready to Import",
							StatusState: "None"
						};
					});

					that.getView().getModel("upload").setProperty("/rows", aFormattedRows);
					sap.ui.core.BusyIndicator.hide();
					MessageToast.show("Parsed " + aFormattedRows.length + " rows successfully.");
				};
				reader.readAsArrayBuffer(oFile);
			}).catch(function (err) {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Failed to parse Excel file: " + err);
			});
		},

		onCreateGatePasses: function () {
			var oModel = this.getView().getModel("upload");
			var aRows = oModel.getProperty("/rows") || [];
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			if (aRows.length === 0) {
				MessageBox.error("No rows to import.");
				return;
			}

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			// Step 1: Fetch ZASH Sales Orders master data for matching
			oODataModel.read("/ZsaleOrdersSet", {
				filters: [new Filter("SalesDocType", FilterOperator.EQ, "ZASH")],
				urlParameters: { "$expand": "SaleodrItmNav" },
				success: function (oData) {
					var aSalesOrders = oData.results || [];
					that._processImport(aRows, aSalesOrders);
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to retrieve Sales Order master data from SAP. Cannot validate Excel rows.");
				}
			});
		},

		_processImport: function (aRows, aSalesOrders) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oUploadModel = this.getView().getModel("upload");
			var that = this;

			// Group rows by VendorName and VehicleNo (to combine multi-item entries)
			var oGroups = {};
			aRows.forEach(function (row) {
				var key = row.VendorName + "_" + row.VehicleNo + "_" + row.IssueDate;
				if (!oGroups[key]) {
					oGroups[key] = {
						VendorName: row.VendorName,
						VehicleNo: row.VehicleNo,
						TransporterName: row.TransporterName,
						TransporterGst: row.TransporterGst,
						Remarks: row.Remarks,
						IssueDate: row.IssueDate,
						OriginalGPNo: row.OriginalGPNo,
						Items: [],
						RowIndexes: []
					};
				}
				oGroups[key].Items.push(row);
				oGroups[key].RowIndexes.push(row.Index);
			});

			var aGroups = Object.keys(oGroups).map(function (k) { return oGroups[k]; });
			var iTotal = aGroups.length;
			var iCurrent = 0;
			var aCreatedGP = [];
			var aErrors = [];

			var fnProcessNext = function () {
				if (iCurrent >= iTotal) {
					sap.ui.core.BusyIndicator.hide();
					that._showSummaryDialog(aCreatedGP, aErrors);
					return;
				}

				var oGroup = aGroups[iCurrent];
				iCurrent++;

				// Update loading text
				sap.ui.core.BusyIndicator.show(0); // refresh spin

				// Clean the search string for fuzzy matching
				var sExcelKey = that._getVendorKeyword(oGroup.VendorName);
				var oSO = aSalesOrders.find(function (so) {
					var sCustName = so.CustomerName || so.Name1 || "";
					var sCustKey = that._getVendorKeyword(sCustName);
					return sCustKey === sExcelKey;
				});

				if (!oSO) {
					oGroup.RowIndexes.forEach(function (idx) {
						oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Error: Cust '" + oGroup.VendorName + "' SO not found");
						oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Error");
					});
					aErrors.push("Group " + oGroup.VendorName + "/" + oGroup.VehicleNo + ": ZASH Sales Order not found in SAP for this Customer.");
					fnProcessNext();
					return;
				}

				// Resolve Sales Order items
				var aSOItems = [];
				if (oSO.SaleodrItmNav) {
					aSOItems = oSO.SaleodrItmNav.results || oSO.SaleodrItmNav || [];
				}

				// Build ASHItmNav payload using SO items matched with excel rates/quantities
				var aASHItmNav = oGroup.Items.map(function (rowItem, index) {
					var oSOItem = aSOItems[index] || aSOItems[0];
					var fQty = parseFloat(rowItem.RequestedQuantity) || 0;
					var fPrice = parseFloat(rowItem.ItemNetPrice) || 0;

					return {
						SalesDocument: oSO.SalesDocument || oSO.Vbeln || "",
						GatePasstype: "NRGP",
						ItemNo: oSOItem ? (oSOItem.ItemNo || "000010") : "000010",
						Material: oSOItem ? (oSOItem.Material || "") : "",
						MaterialDescription: oSOItem ? (oSOItem.MaterialDesc || oSOItem.Arktx || "") : "",
						HSNCode: oSOItem ? (oSOItem.HSNCode || "") : "",
						RequestedQuantity: String(fQty.toFixed(3)),
						UOM: oSOItem ? (oSOItem.UOM || "MT") : "MT",
						ItemNetPrice: String(fPrice.toFixed(2)),
						Totalvalue: String((fQty * fPrice).toFixed(2)),
						GatePassNo: "",
						GatePassReqNo: ""
					};
				});

				var sToday = new Date().toISOString().split("T")[0].replace(/-/g, "");
				var sGPDate = sToday;
				if (oGroup.IssueDate) {
					var parts = String(oGroup.IssueDate).split("-");
					if (parts.length === 3) {
						sGPDate = parts[2] + parts[1] + parts[0];
					}
				}

				var oPayload = {
					GatePassType: "NRGP",
					SalesDocument: oSO.SalesDocument || oSO.Vbeln || "",
					GatePassReqNo: "",
					GPDate: sGPDate,
					SoldToParty: oSO.SoldToParty || oSO.Customer || "",
					CustomerName: oSO.CustomerName || oSO.Name1 || "",
					CustomerGst: oSO.CustomerGST || oSO.CustomerGst || "",
					ZipCode: oSO.PostalCode || "",
					City: oSO.City || "",
					Remarks: (oGroup.OriginalGPNo ? ("Orig GP: " + oGroup.OriginalGPNo + ". ") : "") + (oGroup.Remarks || ""),
					VehicleNo: oGroup.VehicleNo,
					ModeOfDispatch: "ROAD",
					TransporterName: oGroup.TransporterName,
					TransporterGst: oGroup.TransporterGst,
					DCNotes: "",
					DCNumber: "",
					DCDate: sGPDate,
					GatePassNo: "",
					WBTicketNo: "",
					Message: "",
					Approval1: "", // Step 1: Create Request
					ASHItmNav: aASHItmNav
				};

				// Call Step 1: Create the Gate Pass Request
				oODataModel.create("/AshHdrSet", oPayload, {
					success: function (oResponse) {
						var sReqNo = oResponse.GatePassReqNo || "";
						if (!sReqNo) {
							oGroup.RowIndexes.forEach(function (idx) {
								oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Error: No Request No returned");
								oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Error");
							});
							aErrors.push("Group " + oGroup.SalesDocument + "/" + oGroup.VehicleNo + ": Backend did not return a Request Number.");
							fnProcessNext();
							return;
						}

						// Step 2: Approve the newly created Request
						var oApprovePayload = Object.assign({}, oPayload, {
							GatePassReqNo: sReqNo,
							Approval1: "A1", // Approve!
							ASHItmNav: oPayload.ASHItmNav.map(function(item) {
								return Object.assign({}, item, { GatePassReqNo: sReqNo });
							})
						});

						oODataModel.create("/AshHdrSet", oApprovePayload, {
							success: function (oApproveResponse) {
								var sGPNo = oApproveResponse.GatePassNo || "";
								var sBackendMsg = oApproveResponse.Message || "";
								var bIsApproved = sGPNo || sBackendMsg.indexOf("Approved") !== -1;
								
								if (bIsApproved) {
									var sGPDisplay = sGPNo || ("Approved (Req " + sReqNo + ")");
									oGroup.RowIndexes.forEach(function (idx) {
										oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Success: " + sGPDisplay);
										oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Success");
									});
									aCreatedGP.push(sGPDisplay);
								} else {
									var sStatusText = sBackendMsg ? ("Req Created (" + sReqNo + ") but Approval returned message: " + sBackendMsg) : "Req Created (" + sReqNo + ") but GP No is blank";
									oGroup.RowIndexes.forEach(function (idx) {
										oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", sStatusText);
										oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Warning");
									});
									aErrors.push("Group " + oGroup.SalesDocument + "/" + oGroup.VehicleNo + ": " + sStatusText);
								}
								fnProcessNext();
							},
							error: function (oApproveError) {
								var sApproveMsg = "Error approving request " + sReqNo;
								try {
									var oErr = JSON.parse(oApproveError.responseText);
									sApproveMsg = oErr.error.message.value;
								} catch (e) { }

								oGroup.RowIndexes.forEach(function (idx) {
									oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Req Created (" + sReqNo + ") but Approve Failed: " + sApproveMsg);
									oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Warning");
								});
								aErrors.push("Group " + oGroup.SalesDocument + "/" + oGroup.VehicleNo + ": Request created successfully but failed to auto-approve: " + sApproveMsg);
								fnProcessNext();
							}
						});
					},
					error: function (oError) {
						var sMsg = "Error creating request";
						try {
							var oErr = JSON.parse(oError.responseText);
							sMsg = oErr.error.message.value;
						} catch (e) { }

						oGroup.RowIndexes.forEach(function (idx) {
							oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Failed: " + sMsg);
							oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Error");
						});
						aErrors.push("Group " + oGroup.SalesDocument + "/" + oGroup.VehicleNo + ": " + sMsg);
						fnProcessNext();
					}
				});
			};

			// Start processing
			fnProcessNext();
		},

		_getVendorKeyword: function (sName) {
			var sLow = String(sName || "").toLowerCase();
			if (sLow.indexOf("ultra") !== -1) { return "ultratech"; }
			if (sLow.indexOf("dalmia") !== -1) { return "dalmia"; }
			if (sLow.indexOf("ramco") !== -1) { return "ramco"; }
			if (sLow.indexOf("chettinad") !== -1) { return "chettinad"; }
			if (sLow.indexOf("india") !== -1) { return "india"; }
			return sLow;
		},

		_showSummaryDialog: function (aCreatedGP, aErrors) {
			var sMessage = "";
			if (aCreatedGP.length > 0) {
				sMessage += "Successfully created " + aCreatedGP.length + " Gate Passes:\n" + aCreatedGP.join(", ") + "\n\n";
			}
			if (aErrors.length > 0) {
				sMessage += "Failed to import " + aErrors.length + " records:\n" + aErrors.join("\n");
			}

			var sState = aErrors.length === 0 ? "Success" : (aCreatedGP.length > 0 ? "Warning" : "Error");
			if (sState === "Success") {
				MessageBox.success(sMessage, {
					title: "Bulk Creation Complete"
				});
			} else if (sState === "Warning") {
				MessageBox.warning(sMessage, {
					title: "Bulk Creation Complete (With Warnings)"
				});
			} else {
				MessageBox.error(sMessage, {
					title: "Bulk Creation Failed"
				});
			}
		}

	});
});
