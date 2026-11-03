sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.PCPManageDetail", {

		onInit: function () {
			this.getView().setModel(new JSONModel({}), "pcpDetail");
			this.getRouter().getRoute("PCPManageDetail").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			var oSrc  = sap.ui.getCore().getModel("selectedPCPEntry");
			var oMeta = oSrc ? oSrc.getData() : {};
			var oRow  = oMeta.row  || {};
			var sMode = oMeta.mode || "CREATE";

			this._setModel(oRow, sMode);
			this._loadBudgetCodes();

			if (sMode === "PRINT" && oRow.GateEntryNo) {
				this._generatePDF(this._buildPrintData(oRow));
			}
		},

		_setModel: function (oRow, sMode) {
			var bEditable = (sMode === "CREATE" || sMode === "EDIT");
			var sTitle    = { "CREATE": "Add PCP", "EDIT": "Edit PCP", "VIEW": "View PCP", "PRINT": "View PCP" }[sMode] || "Add PCP";

			var sGEDate  = this._toYMD(oRow.GEDateRaw || oRow.GEDate || "");
			var sPCPDate = this._toYMD(oRow.PCPDate || "");
			var sDCDate  = this._toYMD(oRow.DCdate  || "");

			if (!sPCPDate) {
				var oToday = new Date();
				sPCPDate = oToday.getFullYear() + "-" +
					String(oToday.getMonth() + 1).padStart(2, "0") + "-" +
					String(oToday.getDate()).padStart(2, "0");
			}

			var aMappedItems = this._mapItems(oRow.PCPItmNav);
			var fRowTotal = parseFloat(oRow.TotalCost || 0);
			if (fRowTotal === 0 && aMappedItems.length > 0) {
				fRowTotal = aMappedItems.reduce(function(sum, it) { return sum + parseFloat(it.TotalCost || 0); }, 0);
			}
			var sFinalTotal = fRowTotal > 0 ? fRowTotal.toFixed(2) : (oRow.TotalCost || "");

			this.getView().getModel("pcpDetail").setData({
				pageTitle:        sTitle,
				editable:         bEditable,
				mode:             sMode,
				GateEntryNo:      oRow.GateEntryNo      || "",
				GEDateRaw:        oRow.GEDateRaw         || "",
				GEDate:           sGEDate,
				PCPDate:          sPCPDate,
				EntryPoint:       oRow.EntryPoint        || "",
				VendorDesc:       oRow.VendorDesc        || "",
				Vendor:           oRow.Vendor            || "",
				Department:       oRow.Department        || "",
				DCNumber:         oRow.DCNumber          || "",
				DCdate:           sDCDate,
				RGPNumber:        oRow.RGPNumber         || "",
				RRNo:             oRow.RRNo              || "",
				Plant:            oRow.Plant             || "",
				BudgetCode:       oRow.BudgetCode        || "",
				GatepassNo:       (oRow.GatepassNo       || "").trim(),
				PCPNO:            oRow.PCPNO            || "",
				TotalCost:        sFinalTotal,
				Remarks:          oRow.Remarks           || "",
				InspectionStatus: oRow.InspectionStatus  || "",
				Inspectiondate:   this._toYMD(oRow.Inspectiondate || ""),
				items:            aMappedItems
			});
		},

		_loadBudgetCodes: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var that = this;
			oODataModel.read("/ZWBSElementSet", {
				success: function (oData) {
					var aResults = oData.results || [];
					var oModel = that.getView().getModel("pcpDetail");
					if (oModel) {
						var oDropdowns = oModel.getProperty("/dropdowns") || {};
						oDropdowns.budgetCodes = aResults;
						oModel.setProperty("/dropdowns", oDropdowns);
					}
				},
				error: function (oError) {
					console.error("Failed to load budget codes from /ZWBSElementSet", oError);
				}
			});
		},

		_mapItems: function (oPCPItmNav) {
				var aRaw = (oPCPItmNav && oPCPItmNav.results) || [];
				if (aRaw.length === 0) {
					return [{ sno: 1, ItemNo: "00010", ItemDescription: "", RecievedQuantity: "0", UOM: "", TotalCost: "" }];
				}
				var that = this;
				return aRaw.map(function (it, i) {
					return {
						sno: i + 1,
						ItemNo: it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						ItemDescription: it.ItemDescription || "",
						RecievedQuantity: it.RecievedQuantity || "0",
						UOM: that._mapUOMToDropdownKey(it.UOM || it.uom || it.Uom || ""),
						TotalCost: it.TotalCost || ""
					};
				});
			},

			onAddItem: function () {
				var oModel = this.getView().getModel("pcpDetail");
				var aItems = oModel.getProperty("/items") || [];
				aItems.push({
					sno: aItems.length + 1,
					ItemNo: String((aItems.length + 1) * 10).padStart(5, "0"),
					ItemDescription: "",
					RecievedQuantity: "0",
					UOM: "",
					TotalCost: ""
				});
				oModel.setProperty("/items", aItems);
			},

			onDeleteItem: function (oEvent) {
				var oCtx = oEvent.getSource().getBindingContext("pcpDetail");
				var oModel = this.getView().getModel("pcpDetail");
				var aItems = oModel.getProperty("/items");
				var iIdx = parseInt(oCtx.getPath().split("/").pop(), 10);
				aItems.splice(iIdx, 1);
				aItems.forEach(function (it, i) { it.sno = i + 1; });
				oModel.setProperty("/items", aItems);
			},

			// ── Auto-fetch when GE No changes ────────────────────────────────
		onGENoChange: function () {
			this._tryFetchGEDetails();
		},

		onGEDateChange: function () {
			this._tryFetchGEDetails();
		},

		_tryFetchGEDetails: function () {
			var oModel = this.getView().getModel("pcpDetail");
			var sGENo = (oModel.getProperty("/GateEntryNo") || "").trim();
			var sGEDate = (oModel.getProperty("/GEDate") || "").trim();
			if (!sGEDate) {
				sap.m.MessageToast.show("Please select GE Date first.");
				return;
			}
			if (sGENo) { this._fetchGEDetails(sGENo); }
		},

		_fetchGEDetails: function (sGENo) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }
			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			var aFilters = [new Filter("GateEntryNo", FilterOperator.EQ, sGENo)];
			var sModelDate = (this.getView().getModel("pcpDetail").getProperty("/GEDate") || "").trim();
			var sGEDate = "";
			if (sModelDate) {
				var aParts = sModelDate.split("-");
				if (aParts.length === 3) {
					if (aParts[0].length === 4) { // YYYY-MM-DD
						sGEDate = aParts[0] + aParts[1] + aParts[2];
					} else if (aParts[2].length === 4) { // DD-MM-YYYY
						sGEDate = aParts[2] + aParts[1] + aParts[0];
					}
				} else {
					sGEDate = sModelDate.replace(/-/g, "");
				}
			}
			
			if (sGEDate) {
				aFilters.push(new Filter("GEDate", FilterOperator.EQ, sGEDate));
			}


			oODataModel.read("/PCPHdrSet", {
				filters: aFilters,
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length === 0) {
						var sDisplayDate = that.getView().getModel("pcpDetail").getProperty("/GEDate") || "";
						MessageBox.error("Gate Entry No " + sGENo + " not found on date " + sDisplayDate + " (sent as " + sGEDate + ").");
						return;
					}
					var oItem = aResults[0];
					var oModel = that.getView().getModel("pcpDetail");

					oModel.setProperty("/VendorDesc",  oItem.VendorDesc  || "");
					oModel.setProperty("/Vendor",      oItem.Vendor      || "");
					oModel.setProperty("/Department",  oItem.Department  || "");
					oModel.setProperty("/DCNumber",    oItem.DCNumber    || "");
					oModel.setProperty("/Plant",       oItem.Plant       || "");
					oModel.setProperty("/RRNo",        oItem.RRNo        || "");
					oModel.setProperty("/RGPNumber",   oItem.RGPNumber   || "");
					oModel.setProperty("/GatepassNo",  (oItem.GatepassNo || "").trim());
					oModel.setProperty("/PCPNO",       oItem.PCPNO       || "");
					oModel.setProperty("/GEDateRaw",   oItem.GEDate      || "");
					oModel.setProperty("/EntryPoint",  oItem.EntryPoint  || "");
					var sDC = that._toYMD(oItem.DCdate || "");
					if (sDC) { oModel.setProperty("/DCdate", sDC); }

					oModel.setProperty("/items", that._mapItems(oItem.PCPItmNav));

					MessageToast.show("Gate Entry details loaded.");
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to fetch Gate Entry details.");
				}
			});
		},

		// ── Submit ───────────────────────────────────────────────────────
		onSubmit: function () {
			var oModel = this.getView().getModel("pcpDetail");
			var oData  = oModel.getData();

			if (!oData.EntryPoint)              { MessageBox.warning("Please select Entry Point.");          return; }
			if (!oData.PCPDate)                 { MessageBox.warning("Please select PCP Date.");             return; }
			if (!(oData.GateEntryNo || "").trim()) { MessageBox.warning("Please enter GE No.");             return; }
			if (!oData.Department)              { MessageBox.warning("Please select Department.");           return; }
			if (!oData.BudgetCode)              { MessageBox.warning("Please select Budget Code.");          return; }

			var fTotalCost = parseFloat(oData.TotalCost || 0);
			if (!oData.TotalCost || fTotalCost <= 0) { MessageBox.warning("Please enter Total Cost greater than 0."); return; }
			if (fTotalCost > 5000) { MessageBox.error("Total Cost for Petty Cash Purchase cannot exceed 5000."); return; }

			var aItems = oData.items || [];
			if (aItems.length === 0) { MessageBox.warning("Please add at least one line item."); return; }
			var bInvalid = aItems.some(function (it) {
				return !(it.ItemDescription || "").trim() || !it.UOM;
			});
			if (bInvalid) { MessageBox.warning("Please fill Item Description and UOM for all items."); return; }

			var oToday = new Date();
			var sTodaySAP = oToday.getFullYear() + "-" +
				String(oToday.getMonth() + 1).padStart(2, "0") + "-" +
				String(oToday.getDate()).padStart(2, "0");
			oData.InspectionStatus = "Completed";
			oData.Inspectiondate = sTodaySAP;
			oModel.refresh(true);

			MessageBox.confirm("Submit PCP and generate Gate Pass Number?", {
				title: "Confirm Submission",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) { this._doSubmit(oData); }
				}.bind(this)
			});
		},

		_doSubmit: function (oData) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { MessageBox.error("SAP system is not connected."); return; }

			var sGEDateSAP  = (oData.GEDate  || "").replace(/-/g, "");
			var sPCPDateSAP = (oData.PCPDate || "").replace(/-/g, "");
			var sDCDateSAP  = (oData.DCdate  || "").replace(/-/g, "");

			var oPayload = {
				GEDate:       sGEDateSAP,
				Plant:        oData.Plant       || "",
				Vendor:       oData.Vendor      || "",
				VendorDesc:   oData.VendorDesc  || "",
				SourceType:   "PettyCash",
				Department:   oData.Department  || "",
				DCNumber:     oData.DCNumber    || "",
				PurchaseOrder:"",
				RRNo:         oData.RRNo        || "",
				GateEntryNo:  oData.GateEntryNo || "",
				GatepassNo:   "",
				PCPNO:        "",
				PCPDate:      sPCPDateSAP,
				DCdate:       sDCDateSAP,
				BudgetCode:   oData.BudgetCode  || "",
				EntryPoint:   oData.EntryPoint  || "",
				InspectionStatus: oData.InspectionStatus || "",
				Inspectiondate:   (oData.Inspectiondate || "").replace(/-/g, ""),
				Remarks:      oData.Remarks     || "",
				Message:      "",
				PCPItmNav: (oData.items || []).map(function (it, i) {
					return {
						SourceType:       "PettyCash",
						ItemNo:           it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						ItemDescription:  it.ItemDescription || "",
						RecievedQuantity: String(parseFloat(it.RecievedQuantity || 0).toFixed(3)),
						UOM:              it.UOM || it.uom || it.Uom || "",
						TotalCost:        String(parseFloat(oData.TotalCost || 0).toFixed(2)),
						GateEntryNo:      oData.GateEntryNo || "",
						RRNo:             oData.RRNo        || "",
						PurchaseOrder:    "",
						Plant:            oData.Plant       || ""
					};
				})
			};

			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.refreshSecurityToken(function () {
				oODataModel.create("/PCPHdrSet", oPayload, {
					success: function (oResponse) {
						sap.ui.core.BusyIndicator.hide();
						var sGP = ((oResponse && (oResponse.GatepassNo || oResponse.Message)) || "").trim();
						var sPCPNO = ((oResponse && oResponse.PCPNO) || "").trim();

						that.getView().getModel("pcpDetail").setProperty("/GatepassNo", sGP || "GENERATED");
						that.getView().getModel("pcpDetail").setProperty("/editable",   false);

						var showPopup = function(finalPCPNo) {
							that.getView().getModel("pcpDetail").setProperty("/PCPNO", finalPCPNo);
							var sMsg = "PCP submitted successfully!";
							if (finalPCPNo) {
								sMsg += "\nPCP No: " + finalPCPNo;
							}
							if (sGP && sGP !== finalPCPNo) {
								sMsg += "\nGate Pass No: " + sGP;
							}
							sMsg += "\n\nThe Gate Entry status is now Closed.";

							MessageBox.success(sMsg, {
								title: "Success",
								onClose: function () {
									that.onPrint();
								}
							});
						};

						// Workaround: If backend didn't return PCPNO, fetch it manually using GateEntryNo
						if (!sPCPNO && oData.GateEntryNo) {
							oODataModel.read("/PCPHdrSet", {
								filters: [new Filter("GateEntryNo", FilterOperator.EQ, oData.GateEntryNo)],
								success: function (oReadData) {
									var fetchedPCP = "";
									if (oReadData.results && oReadData.results.length > 0) {
										fetchedPCP = oReadData.results[0].PCPNO || "";
									}
									showPopup(fetchedPCP);
								},
								error: function () {
									showPopup(""); // Show without PCP if fetch fails
								}
							});
						} else {
							showPopup(sPCPNO);
						}
					},
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sMsg = "Failed to submit PCP.";
						try {
							var oBody = JSON.parse(oError.responseText);
							if (oBody.error && oBody.error.message && oBody.error.message.value) { sMsg = oBody.error.message.value; }
						} catch (e) {
							try {
								var oMatch = (oError.responseText || "").match(/<message[^>]*>([^<]+)<\/message>/i);
								if (oMatch && oMatch[1]) { sMsg = oMatch[1]; }
							} catch (e2) {}
						}
						MessageBox.error(sMsg);
					}
				});
			}, function () {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Failed to refresh security token. Please reload the page.");
			});
		},

		// ── Print ─────────────────────────────────────────────────────────
		onPrint: function () {
			var oData = this.getView().getModel("pcpDetail").getData();
			this._generatePDF(this._buildPrintData(oData));
		},

		_buildPrintData: function (oData) {
			// Convert display dates back for print (they may be yyyy-MM-dd from DatePicker)
			var fnFmt = function (s) {
				if (!s) { return ""; }
				// yyyy-MM-dd → DD-MM-YYYY
				var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
				if (m) { return m[3] + "-" + m[2] + "-" + m[1]; }
				return s;
			};
			
			// Handle items array whether it comes from the local model (items) or direct navigation (PCPItmNav)
			var aItems = oData.items;
			if (!aItems || aItems.length === 0) {
				aItems = this._mapItems(oData.PCPItmNav);
			}

			return {
				GateEntryNo:      oData.GateEntryNo      || "",
				GatepassNo:       oData.GatepassNo        || "",
				PCPNO:            oData.PCPNO             || "",
				PCPDate:          fnFmt(oData.PCPDate),
				GEDate:           fnFmt(oData.GEDate),
				EntryPoint:       oData.EntryPoint        || "",
				VendorDesc:       oData.VendorDesc        || "",
				Department:       oData.Department        || "",
				DCNumber:         oData.DCNumber          || "",
				DCdate:           fnFmt(oData.DCdate),
				BudgetCode:       oData.BudgetCode        || "",
				TotalCost:        oData.TotalCost         || "0.00",
				items:            aItems
			};
		},

		_generatePDF: async function (oData) {
			if (!oData.GateEntryNo) {
				MessageBox.warning("No Gate Entry data available for printing.");
				return;
			}

			var jsPDFLib = window.jspdf;
			if (!jsPDFLib) {
				MessageBox.error("PDF library not loaded. Please refresh the page.");
				return;
			}
			var jsPDF = jsPDFLib.jsPDF;
			var doc     = new jsPDF("p", "mm", "a4");
			var pageW   = doc.internal.pageSize.width;
			var margin  = 14;

			// ── Logo ──────────────────────────────────────────────────────
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, "PNG", margin, 8, 28, 10);
			} catch (e) {
				doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(180, 0, 0);
				doc.text("MEIL", margin, 16); doc.setTextColor(0, 0, 0);
			}

			// ── Company header ────────────────────────────────────────────
			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold"); doc.setFontSize(14);
			doc.text("MEIL Neyveli Energy Private Limited", pageW / 2, 14, { align: "center" });
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageW / 2, 19, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageW / 2, 23, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageW / 2, 27, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTCO26223", pageW / 2, 31, { align: "center" });

			// ── Title ─────────────────────────────────────────────────────
			doc.setFontSize(11); doc.setFont("helvetica", "bold");
			doc.text("CASH PURCHASE NOTE", pageW / 2, 41, { align: "center" });
			var titleW = doc.getTextWidth("CASH PURCHASE NOTE");
			doc.setLineWidth(0.3);
			doc.line(pageW / 2 - titleW / 2, 42.5, pageW / 2 + titleW / 2, 42.5);

			// ── Info block ────────────────────────────────────────────────
			var y = 52;
			doc.setFontSize(9); doc.setFont("helvetica", "normal");

			// Left: Vendor Name
			doc.setFont("helvetica", "bold");
			doc.text("Vendor", margin, y);
			doc.text("Name:", margin, y + 5);
			doc.setFont("helvetica", "normal");
			doc.text(oData.VendorDesc || "", margin + 20, y + 5);

			// Middle: PCP No, GP No, PCP Date, DC/Inv No, Dept
			var col2 = 85;
			var valCol2 = col2 + 22;
			doc.setFont("helvetica", "bold");
			doc.text("PCP No:",     col2, y);
			doc.text("GP No:",      col2, y + 6);
			doc.text("PCP Date:",   col2, y + 12);
			doc.text("DC/Inv No:",  col2, y + 18);
			doc.text("Dept:",       col2, y + 24);
			doc.setFont("helvetica", "normal");
			doc.text(oData.PCPNO      || "-",     valCol2, y);
			doc.text(oData.GatepassNo || "-",     valCol2, y + 6);
			doc.text(oData.PCPDate    || "-",     valCol2, y + 12);
			doc.text(oData.DCNumber   || "-",     valCol2, y + 18);
			doc.text(oData.Department || "-",     valCol2, y + 24);

			// Right: GE No, GE Date, DC/Inv Date, Budget Code
			var col3 = 150;
			var valCol3 = col3 + 25;
			doc.setFont("helvetica", "bold");
			doc.text("GE No",          col3, y);
			doc.text("GE Date:",        col3, y + 6);
			doc.text("DC/Inv Date:",    col3, y + 12);
			doc.text("Budget Code:",    col3, y + 18);
			doc.setFont("helvetica", "normal");
			doc.text(String(oData.GateEntryNo || "-"), valCol3, y);
			doc.text(oData.GEDate   || "-",            valCol3, y + 6);
			doc.text(oData.DCdate   || "-",            valCol3, y + 12);
			doc.text(oData.BudgetCode || "-",          valCol3, y + 18);

			// ── Items table ───────────────────────────────────────────────
			var tableY = y + 27;
			var aItems = oData.items || [];
			var totalAmt = 0;
			var tableBody = aItems.map(function (it, i) {
				var fQty = parseFloat(it.RecievedQuantity || 0);
				var fAmt = parseFloat(it.TotalCost || 0);
				if (fAmt === 0 && aItems.length === 1) {
					fAmt = parseFloat(oData.TotalCost || 0);
				}
				totalAmt += fAmt;
				return [i + 1, it.ItemDescription || "", it.UOM || "", fQty.toFixed(2), fAmt.toFixed(2)];
			});
			if (tableBody.length === 0) { tableBody = [["", "", "", "", ""]]; }

			doc.autoTable({
				startY: tableY,
				head: [["S.No", "DESCRIPTION", "UOM", "QTY", "Amount"]],
				body: tableBody,
				theme: "grid",
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "normal", lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], cellPadding: 3 },
				columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 25 }, 3: { cellWidth: 25 }, 4: { cellWidth: 30 } },
				margin: { left: margin, right: margin }
			});

			// ── Footer row: In Words | Total | Amount ─────────────────────
			var finalY = doc.lastAutoTable.finalY;
			var footH  = 9;
			doc.setLineWidth(0.3);
			doc.rect(margin, finalY, pageW - margin * 2, footH);

			var cols        = doc.lastAutoTable.columns;
			var inWordsW    = cols[0].width + cols[1].width + cols[2].width;
			var totalLabelW = cols[3].width;

			doc.line(margin + inWordsW,              finalY, margin + inWordsW,              finalY + footH);
			doc.line(margin + inWordsW + totalLabelW, finalY, margin + inWordsW + totalLabelW, finalY + footH);

			doc.setFontSize(9); doc.setFont("helvetica", "normal");
			doc.text("In Words - Rupees " + this._numberToWords(Math.round(totalAmt)) + " Only.", margin + 3, finalY + 6);
			doc.setFont("helvetica", "bold");
			doc.text("Total",              margin + inWordsW + 3,              finalY + 6);
			doc.setFont("helvetica", "normal");
			doc.text(totalAmt.toFixed(2),      margin + inWordsW + totalLabelW + 3, finalY + 6);

			// ── Signature ─────────────────────────────────────────────────
			doc.text("For MEIL Neyveli Energy Private Limited", pageW - margin, finalY + 45, { align: "right" });
			doc.text("Authorised Signatory",                   pageW - margin, finalY + 60, { align: "right" });

			doc.save("PCP_" + (oData.GatepassNo || oData.GateEntryNo || "Draft") + ".pdf");
			MessageToast.show("CASH PURCHASE NOTE downloaded.");
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image(); img.crossOrigin = "Anonymous";
				img.onload  = function () {
					var c = document.createElement("canvas");
					c.width = img.width; c.height = img.height;
					c.getContext("2d").drawImage(img, 0, 0);
					resolve(c.toDataURL("image/png"));
				};
				img.onerror = reject;
				img.src = url;
			});
		},

		_numberToWords: function (num) {
			var a = ["","One ","Two ","Three ","Four ","Five ","Six ","Seven ","Eight ","Nine ","Ten ","Eleven ","Twelve ","Thirteen ","Fourteen ","Fifteen ","Sixteen ","Seventeen ","Eighteen ","Nineteen "];
			var b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
			if ((num = num.toString()).length > 9) { return "overflow"; }
			var n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) { return ""; }
			var s = "";
			s += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
			s += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh "  : "";
			s += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
			s += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
			s += (n[5] != 0) ? ((s !== "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";
			return s;
		},

		_toYMD: function (vDate) {
			if (!vDate) { return ""; }
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate) && !/^0+$/.test(vDate)) {
				return vDate.slice(0, 4) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(6, 8);
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				return vDate.getFullYear() + "-" + String(vDate.getMonth() + 1).padStart(2, "0") + "-" + String(vDate.getDate()).padStart(2, "0");
			}
			if (typeof vDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(vDate)) { return vDate.slice(0, 10); }
			return "";
		},

		onNavBack: function () {
			this.getRouter().navTo("PCPManageList");
		},

		_mapUOMToDropdownKey: function (sUom) {
			if (!sUom) return "";
			var sClean = sUom.trim().toUpperCase();
			if (sClean === "NO" || sClean === "NO." || sClean === "NOS" || sClean === "EA" || sClean === "PC" || sClean === "ST" || sClean === "NUMBER" || sClean === "NUM") {
				return "Number";
			}
			if (sClean === "KG" || sClean === "KGS" || sClean === "KILOGRAM") {
				return "Kilogram";
			}
			if (sClean === "M" || sClean === "MTR" || sClean === "METERS" || sClean === "METER") {
				return "Meters";
			}
			if (sClean === "MT" || sClean === "TON" || sClean === "TONS" || sClean === "METRIC TONS") {
				return "Metric Tons";
			}
			if (sClean === "FT" || sClean === "FEET") {
				return "Feet";
			}
			if (sClean === "L" || sClean === "LTR" || sClean === "LITRE" || sClean === "LITRES") {
				return "Litre";
			}
			if (sClean === "SET" || sClean === "SETS") {
				return "Set";
			}
			if (sClean === "ROL" || sClean === "ROLL" || sClean === "ROLLS") {
				return "Roll";
			}
			if (sClean === "BOX" || sClean === "BOXES") {
				return "Box";
			}
			if (sClean === "BAG" || sClean === "BAGS") {
				return "Bag";
			}
			return sUom.charAt(0).toUpperCase() + sUom.slice(1).toLowerCase();
		}

	});
});
