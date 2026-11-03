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
					["Sales Document", "Vehicle No", "Sent Quantity", "Item Net Price", "Remarks", "Transporter Name", "Transporter GST"]
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
						var rawQty = row["SentQuantity"] !== undefined ? row["SentQuantity"] :
						             row["Sent Quantity"] !== undefined ? row["Sent Quantity"] :
						             row["RequestedQuantity"] !== undefined ? row["RequestedQuantity"] :
						             row["Requested Quantity"] !== undefined ? row["Requested Quantity"] :
						             row["Qty Send"] !== undefined ? row["Qty Send"] :
						             row["Quantity"] !== undefined ? row["Quantity"] :
						             row["Qty"] !== undefined ? row["Qty"] : "";
						var rawPrice = row["ItemNetPrice"] !== undefined ? row["ItemNetPrice"] :
						               row["Item Net Price"] !== undefined ? row["Item Net Price"] :
						               row["UOP"] !== undefined ? row["UOP"] :
						               row["Rate"] !== undefined ? row["Rate"] :
						               row["Price"] !== undefined ? row["Price"] : "";

						return {
							Index: idx + 1,
							SalesDocument: row["SalesDocument"] || row["Sales Document"] || row["SalesDoc"] || row["Sales Doc"] || "",
							IssueDate: row["Issue Date"] || row["IssueDate"] || "",
							OriginalGPNo: row["Ash Gate Pass Number"] || row["AshGatePassNumber"] || "",
							VendorName: row["Vendor Name"] || row["VendorName"] || "",
							ItemDescription: row["Item Description"] || row["ItemDescription"] || "",
							RequestedQuantity: rawQty !== "" ? parseFloat(rawQty) || 0 : 0,
							Uom: row["Uom"] || row["UOM"] || "",
							HSNCode: row["HSN Code"] || row["HSNCode"] || "",
							ItemNetPrice: rawPrice !== "" ? parseFloat(rawPrice) || 0 : 0,
							Remarks: row["Remarks"] || row["Gate Pass Remarks"] || row["GatePassRemarks"] || "",
							DCNumber: row["DC No"] || row["DC Number"] || row["DCNo"] || "",
							DCNotes: row["DC Notes"] || row["DCNotes"] || "",
							VehicleNo: row["VehicleNo"] !== undefined ? row["VehicleNo"] :
							           row["Vehicle No"] !== undefined ? row["Vehicle No"] :
							           row["Vehicle Number"] !== undefined ? row["Vehicle Number"] : "",
							TransporterName: row["TransporterName"] || row["Transporter Name"] || row["Transport Name"] || row["TransportName"] || "",
							TransporterGst: row["TransporterGst"] || row["Transporter GST"] || row["TransporterGst"] || "",
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

			// Quantity is required on every row; Item Net Price is optional.
			var aBadRows = aRows.filter(function (r) {
				return !(parseFloat(r.RequestedQuantity) > 0);
			});
			if (aBadRows.length > 0) {
				aBadRows.forEach(function (r) {
					oModel.setProperty("/rows/" + (r.Index - 1) + "/StatusText", "Missing Quantity");
					oModel.setProperty("/rows/" + (r.Index - 1) + "/StatusState", "Error");
				});
				MessageBox.error(
					aBadRows.length + " row(s) have Quantity missing/zero (rows " +
					aBadRows.map(function (r) { return r.Index; }).join(", ") + "). Please correct the Excel and re-upload."
				);
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

			// One gate pass per Excel row — each row is a separate weighbridge trip,
			// so the same vehicle appearing on several rows must NOT merge into one
			// gate pass (the row index keeps every trip distinct).
			var oGroups = {};
			aRows.forEach(function (row) {
				var key = row.Index + "_" + (row.SalesDocument || "") + "_" + row.VehicleNo;
				if (!oGroups[key]) {
					oGroups[key] = {
						SalesDocument: row.SalesDocument,
						VendorName: row.VendorName,
						VehicleNo: row.VehicleNo,
						TransporterName: row.TransporterName,
						TransporterGst: row.TransporterGst,
						Remarks: row.Remarks,
						IssueDate: row.IssueDate,
						OriginalGPNo: row.OriginalGPNo,
						DCNumber: row.DCNumber,
						DCNotes: row.DCNotes,
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

				// Match Sales Order: Prioritize exact SalesDocument matching if provided
				var oSO = null;
				if (oGroup.SalesDocument) {
					var sSalesDocExcel = String(oGroup.SalesDocument).trim();
					oSO = aSalesOrders.find(function (so) {
						var sSO = String(so.SalesDocument || so.Vbeln || "").trim();
						// Remove leading zeros for matching if they are numeric
						return sSO === sSalesDocExcel || parseInt(sSO, 10) === parseInt(sSalesDocExcel, 10);
					});
				}

				// Fallback to fuzzy vendor matching if no SO found and VendorName is present
				if (!oSO && oGroup.VendorName) {
					var sExcelKey = that._getVendorKeyword(oGroup.VendorName);
					oSO = aSalesOrders.find(function (so) {
						var sCustName = so.CustomerName || so.Name1 || "";
						var sCustKey = that._getVendorKeyword(sCustName);
						return sCustKey === sExcelKey;
					});
				}

				if (!oSO) {
					oGroup.RowIndexes.forEach(function (idx) {
						var sErrText = oGroup.SalesDocument ? 
							"Error: SO '" + oGroup.SalesDocument + "' not found" :
							"Error: Cust '" + oGroup.VendorName + "' SO not found";
						oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", sErrText);
						oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Error");
					});
					aErrors.push("Group " + (oGroup.SalesDocument || oGroup.VendorName) + "/" + oGroup.VehicleNo + ": ZASH Sales Order not found in SAP.");
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
					var fQty = parseFloat(rowItem.RequestedQuantity) || 0; // Excel quantity
					var fPrice = parseFloat(rowItem.ItemNetPrice) || 0;    // Excel price

					var fSOQty = parseFloat(oSOItem ? (oSOItem.OrderQuantity || oSOItem.SOQuantity || oSOItem.RequestedQuantity || 0) : 0) || fQty;
					var fOpenQty = (oSOItem && oSOItem.OpenQuantity !== undefined && oSOItem.OpenQuantity !== null && oSOItem.OpenQuantity !== "") ? parseFloat(oSOItem.OpenQuantity) : fSOQty;
					var fBalQty = fOpenQty - fQty;

					var oMappedItem = that._buildAshItemPayload({
						// Use the SO item's (zero-padded) document number — the manual flow
						// persists items under this key.
						SalesDocument: (oSOItem && oSOItem.SalesDocument) || oSO.SalesDocument || oSO.Vbeln || "",
						GatePasstype: "NRGP",
						ItemNo: oSOItem ? (oSOItem.ItemNo || "10").padStart(6, "0") : "000010",
						Material: oSOItem ? (oSOItem.Material || "") : "",
						MaterialDescription: oSOItem ? (oSOItem.MaterialDesc || oSOItem.Arktx || "") : "",
						HSNCode: oSOItem ? (oSOItem.HSNCode || "") : "",
						SOQuantity: fSOQty,
						OpenQuantity: fOpenQty,
						SentQuantity: fQty, // Only SentQuantity comes from Excel!
						BalanceQuantity: fBalQty,
						UOM: oSOItem ? (oSOItem.UOM || "") : "",
						ItemNetPrice: fPrice,
						Totalvalue: fQty * fPrice,
						GatePassNo: "",
						GatePassReqNo: ""
					});
					return that._typePayloadForEntity(oODataModel, oMappedItem);
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
					DCNotes: oGroup.DCNotes || "",
					DCNumber: oGroup.DCNumber || "",
					DCDate: sGPDate,
					GatePassNo: "",
					WBTicketNo: "",
					Message: "",
					Approval1: "", // Step 1: Create Request
					ASHItmNav: aASHItmNav
				};
				oPayload = that._typePayloadForEntity(oODataModel, oPayload);

				// Call Step 1: Create the Gate Pass Request
				oODataModel.create("/AshHdrSet", oPayload, {
					success: function (oResponse) {
						var sGPNo = oResponse.GatePassNo || "";
						var sReqNo = oResponse.GatePassReqNo || "";

						// If Gate Pass is generated directly, show success immediately
						if (sGPNo) {
							oGroup.RowIndexes.forEach(function (idx) {
								oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Success: GP " + sGPNo);
								oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Success");
							});
							aCreatedGP.push(sGPNo);
							fnProcessNext();
							return;
						}

						if (!sReqNo) {
							oGroup.RowIndexes.forEach(function (idx) {
								oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Error: No GP No or Request No returned");
								oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Error");
							});
							aErrors.push("Group " + oGroup.SalesDocument + "/" + oGroup.VehicleNo + ": Backend did not return a GP No or Request No.");
							fnProcessNext();
							return;
						}

						// Step 2: Approve the newly created Request
						var oApprovePayload = Object.assign({}, oPayload, {
							GatePassReqNo: sReqNo,
							Approval1: "A1", // Approve!
							ASHItmNav: oPayload.ASHItmNav.map(function(item) {
								// Items are already canonical — only the req no changes
								return Object.assign({}, item, { GatePassReqNo: sReqNo });
							})
						});
						oApprovePayload = that._typePayloadForEntity(oODataModel, oApprovePayload);

						oODataModel.create("/AshHdrSet", oApprovePayload, {
							success: function (oApproveResponse) {
								// Step 3: Add a 1.5-second delay to let the SAP background asynchronous update tasks finish
								// committing the request items to the database tables before we read/promote them!
								setTimeout(function () {
									oODataModel.read("/AshHdrSet", {
										filters: [new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)],
										urlParameters: { "$expand": "ASHItmNav" },
										success: function (oReqData) {
											var oReqRecord = oReqData.results && oReqData.results[0];
											var aDBItems = (oReqRecord && oReqRecord.ASHItmNav && oReqRecord.ASHItmNav.results) || [];
											if (aDBItems.length === 0) {
												aDBItems = oPayload.ASHItmNav; // Fallback to local
											}

											var oSubmitPayload = Object.assign({}, oPayload, {
												GatePassReqNo: sReqNo,
												Approval1: "A1", // Submit Approved!
												ASHItmNav: aDBItems.map(function(item) {
													var oMappedItem = that._buildAshItemPayload(Object.assign({}, item, {
														GatePassReqNo: "",
														GatePassNo: ""
													}));
													return that._typePayloadForEntity(oODataModel, oMappedItem);
												})
											});
											oSubmitPayload = that._typePayloadForEntity(oODataModel, oSubmitPayload);

											oODataModel.create("/AshHdrSet", oSubmitPayload, {
												success: function (oSubmitResponse) {
													var sGPNo3 = oSubmitResponse.GatePassNo || "";
													if (sGPNo3) {
														var sGPDisplay = "GP " + sGPNo3 + " (Req " + sReqNo + ")";
														oGroup.RowIndexes.forEach(function (idx) {
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Success: " + sGPDisplay);
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Success");
														});
														aCreatedGP.push(sGPDisplay);
													} else {
														oGroup.RowIndexes.forEach(function (idx) {
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Approved (Req " + sReqNo + ") but GP is blank");
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Warning");
														});
														aCreatedGP.push("Approved (Req " + sReqNo + ")");
													}
													fnProcessNext();
												},
												error: function (oSubmitError) {
													var sSubmitMsg = "Error generating gate pass";
													try {
														var oErr = JSON.parse(oSubmitError.responseText);
														sSubmitMsg = oErr.error.message.value;
													} catch (e) { }

													oGroup.RowIndexes.forEach(function (idx) {
														oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Approved (Req " + sReqNo + ") but GP Gen Failed: " + sSubmitMsg);
														oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Warning");
													});
													aErrors.push("Group " + oGroup.SalesDocument + "/" + oGroup.VehicleNo + ": Req approved but GP generation failed: " + sSubmitMsg);
													fnProcessNext();
												}
											});
										},
										error: function () {
											// Fallback if DB read fails: use local items mapping directly
											var oSubmitPayload = Object.assign({}, oPayload, {
												GatePassReqNo: sReqNo,
												Approval1: "A1",
												ASHItmNav: oPayload.ASHItmNav.map(function(item) {
													var oMappedItem = that._buildAshItemPayload(Object.assign({}, item, {
														GatePassReqNo: "",
														GatePassNo: ""
													}));
													return that._typePayloadForEntity(oODataModel, oMappedItem);
												})
											});
											oSubmitPayload = that._typePayloadForEntity(oODataModel, oSubmitPayload);

											oODataModel.create("/AshHdrSet", oSubmitPayload, {
												success: function (oSubmitResponse) {
													var sGPNo3 = oSubmitResponse.GatePassNo || "";
													if (sGPNo3) {
														var sGPDisplay = "GP " + sGPNo3 + " (Req " + sReqNo + ")";
														oGroup.RowIndexes.forEach(function (idx) {
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Success: " + sGPDisplay);
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Success");
														});
														aCreatedGP.push(sGPDisplay);
													} else {
														oGroup.RowIndexes.forEach(function (idx) {
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Approved (Req " + sReqNo + ") but GP is blank");
															oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Warning");
														});
														aCreatedGP.push("Approved (Req " + sReqNo + ")");
													}
													fnProcessNext();
												},
												error: function (oSubmitError) {
													var sSubmitMsg = "Error generating gate pass";
													try {
														var oErr = JSON.parse(oSubmitError.responseText);
														sSubmitMsg = oErr.error.message.value;
													} catch (e) { }

													oGroup.RowIndexes.forEach(function (idx) {
														oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusText", "Approved (Req " + sReqNo + ") but GP Gen Failed: " + sSubmitMsg);
														oUploadModel.setProperty("/rows/" + (idx - 1) + "/StatusState", "Warning");
													});
													aErrors.push("Group " + oGroup.SalesDocument + "/" + oGroup.VehicleNo + ": Req approved but GP generation failed: " + sSubmitMsg);
													fnProcessNext();
												}
											});
										}
									});
								}, 1500);
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
		},

		onFileSizeExceed: function (oEvent) {
			var sFileName = oEvent.getParameter("fileName") || "Excel file";
			MessageBox.error(sFileName + " exceeds the maximum file size limit of 1 MB. Please upload a smaller file.");
		}
	});
});
